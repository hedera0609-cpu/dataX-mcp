/**
 * ECS デプロイモジュール
 * ECRへのイメージプッシュとECSサービスの作成・管理を担当する
 */

import {
  ECRClient,
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
  GetAuthorizationTokenCommand,
} from "@aws-sdk/client-ecr";
import {
  ECSClient,
  CreateServiceCommand,
  UpdateServiceCommand,
  DeleteServiceCommand,
  DescribeServicesCommand,
  RegisterTaskDefinitionCommand,
  DeregisterTaskDefinitionCommand,
  ListTaskDefinitionsCommand,
} from "@aws-sdk/client-ecs";
import {
  ElasticLoadBalancingV2Client,
  CreateTargetGroupCommand,
  CreateRuleCommand,
  DeleteTargetGroupCommand,
  DeleteRuleCommand,
  DescribeRulesCommand,
  DescribeTargetGroupsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { execSync } from "child_process";

// 各種設定を環境変数から取得する
const AWS_REGION = process.env.AWS_REGION ?? "ap-northeast-2";
const ECR_REGISTRY = process.env.ECR_REGISTRY ?? "";
const ECS_CLUSTER = process.env.ECS_CLUSTER ?? "datax-cluster";
const ALB_LISTENER_ARN = process.env.ALB_LISTENER_ARN ?? "";
const VPC_ID = process.env.VPC_ID ?? "";
const TASK_EXECUTION_ROLE_ARN = process.env.TASK_EXECUTION_ROLE_ARN ?? "";
const TASK_ROLE_ARN = process.env.TASK_ROLE_ARN ?? "";
// ECSタスクが配置されるプライベートサブネット（カンマ区切り）
const ECS_SUBNETS = (process.env.ECS_SUBNETS ?? "").split(",").filter(Boolean);
// ECSタスク用セキュリティグループ
const ECS_SECURITY_GROUP = process.env.ECS_SECURITY_GROUP ?? "";

const ecrClient = new ECRClient({ region: AWS_REGION });
const ecsClient = new ECSClient({ region: AWS_REGION });
const albClient = new ElasticLoadBalancingV2Client({ region: AWS_REGION });

/**
 * アプリ名からECRリポジトリ名を生成する
 */
function getRepositoryName(nickname: string, appName: string): string {
  return `datax/${nickname}/${appName}`;
}

/**
 * アプリ名からECSサービス名を生成する
 */
function getServiceName(nickname: string, appName: string): string {
  return `datax-${nickname}-${appName}`;
}

/**
 * ECRリポジトリを取得または作成する
 * リポジトリが存在しない場合は新規作成する
 */
export async function ensureEcrRepository(
  nickname: string,
  appName: string
): Promise<string> {
  const repoName = getRepositoryName(nickname, appName);

  try {
    // 既存リポジトリを確認する
    const result = await ecrClient.send(
      new DescribeRepositoriesCommand({ repositoryNames: [repoName] })
    );
    return result.repositories?.[0]?.repositoryUri ?? "";
  } catch {
    // リポジトリが存在しない場合は新規作成する
    const result = await ecrClient.send(
      new CreateRepositoryCommand({
        repositoryName: repoName,
        imageScanningConfiguration: { scanOnPush: true },
        imageTagMutability: "MUTABLE",
      })
    );
    return result.repository?.repositoryUri ?? "";
  }
}

/**
 * ECR認証トークンを取得してDockerにログインする
 */
export async function loginToEcr(): Promise<void> {
  const result = await ecrClient.send(
    new GetAuthorizationTokenCommand({})
  );

  const authData = result.authorizationData?.[0];
  if (!authData?.authorizationToken || !authData.proxyEndpoint) {
    throw new Error("ECR認証トークンの取得に失敗しました");
  }

  // Base64デコードしてユーザー名とパスワードを分離する
  const decoded = Buffer.from(authData.authorizationToken, "base64").toString();
  const [username, password] = decoded.split(":");

  execSync(
    `echo ${password} | docker login --username ${username} --password-stdin ${authData.proxyEndpoint}`,
    { stdio: "pipe" }
  );
}

/**
 * DockerイメージをビルドしてECRにプッシュする
 * S3から取得済みのファイルが一時ディレクトリに展開済みであることを前提とする
 */
export async function buildAndPushImage(
  nickname: string,
  appName: string,
  buildDir: string,
  repositoryUri: string
): Promise<string> {
  const imageTag = `${repositoryUri}:latest`;

  // Dockerイメージをビルドする
  execSync(`docker build -t ${imageTag} ${buildDir}`, {
    stdio: "pipe",
    timeout: 300_000, // 5分タイムアウト
  });

  // ECRにプッシュする
  execSync(`docker push ${imageTag}`, {
    stdio: "pipe",
    timeout: 120_000, // 2分タイムアウト
  });

  return imageTag;
}

/**
 * ALBターゲットグループを作成する
 * アプリごとに独立したターゲットグループを作成する
 */
export async function createTargetGroup(
  nickname: string,
  appName: string
): Promise<string> {
  const tgName = `datax-${nickname}-${appName}`.slice(0, 32);

  const result = await albClient.send(
    new CreateTargetGroupCommand({
      Name: tgName,
      Protocol: "HTTP",
      Port: 8080,
      VpcId: VPC_ID,
      TargetType: "ip",
      HealthCheckPath: "/",
      HealthCheckIntervalSeconds: 30,
      HealthCheckTimeoutSeconds: 5,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 3,
    })
  );

  return result.TargetGroups?.[0]?.TargetGroupArn ?? "";
}

/**
 * ALBリスナールールを作成する
 * ホストヘッダーパターンでルーティングする（Phase 2で使用）
 * Phase 1ではパスベースルーティングを使用する
 */
export async function createAlbRule(
  targetGroupArn: string,
  nickname: string,
  appName: string,
  domain: string
): Promise<string> {
  // 既存ルールの優先度を確認して重複しない番号を割り当てる
  const existingRules = await albClient.send(
    new DescribeRulesCommand({ ListenerArn: ALB_LISTENER_ARN })
  );

  const usedPriorities = new Set(
    existingRules.Rules?.map((r) => Number(r.Priority)).filter(
      (p) => !isNaN(p)
    ) ?? []
  );

  // 空き優先度番号を探す（1〜999の範囲）
  let priority = 1;
  while (usedPriorities.has(priority)) priority++;

  const hostPattern = `datax-${nickname}--${appName}.${domain}`;

  const result = await albClient.send(
    new CreateRuleCommand({
      ListenerArn: ALB_LISTENER_ARN,
      Priority: priority,
      Conditions: [
        {
          Field: "host-header",
          Values: [hostPattern],
        },
      ],
      Actions: [
        {
          Type: "forward",
          TargetGroupArn: targetGroupArn,
        },
      ],
    })
  );

  return result.Rules?.[0]?.RuleArn ?? "";
}

/**
 * ECSタスク定義を登録する
 */
export async function registerTaskDefinition(
  nickname: string,
  appName: string,
  imageUri: string
): Promise<string> {
  const family = getServiceName(nickname, appName);

  const result = await ecsClient.send(
    new RegisterTaskDefinitionCommand({
      family,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: "256",
      memory: "512",
      executionRoleArn: TASK_EXECUTION_ROLE_ARN,
      taskRoleArn: TASK_ROLE_ARN || undefined,
      containerDefinitions: [
        {
          name: "app",
          image: imageUri,
          portMappings: [
            {
              containerPort: 8080,
              protocol: "tcp",
            },
          ],
          environment: [
            { name: "PORT", value: "8080" },
            { name: "DATAX_NICKNAME", value: nickname },
            { name: "DATAX_APP_NAME", value: appName },
          ],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": `/datax/apps/${nickname}/${appName}`,
              "awslogs-region": AWS_REGION,
              "awslogs-stream-prefix": "ecs",
              "awslogs-create-group": "true",
            },
          },
          essential: true,
        },
      ],
    })
  );

  return result.taskDefinition?.taskDefinitionArn ?? "";
}

/**
 * ECSサービスを作成または更新する
 */
export async function deployEcsService(
  nickname: string,
  appName: string,
  taskDefinitionArn: string,
  targetGroupArn: string
): Promise<string> {
  const serviceName = getServiceName(nickname, appName);

  // 既存サービスの確認
  const existing = await ecsClient.send(
    new DescribeServicesCommand({
      cluster: ECS_CLUSTER,
      services: [serviceName],
    })
  );

  const activeService = existing.services?.find(
    (s) => s.status !== "INACTIVE"
  );

  if (activeService) {
    // 既存サービスを更新する
    const result = await ecsClient.send(
      new UpdateServiceCommand({
        cluster: ECS_CLUSTER,
        service: serviceName,
        taskDefinition: taskDefinitionArn,
        forceNewDeployment: true,
      })
    );
    return result.service?.serviceArn ?? "";
  }

  // 新規サービスを作成する
  const result = await ecsClient.send(
    new CreateServiceCommand({
      cluster: ECS_CLUSTER,
      serviceName,
      taskDefinition: taskDefinitionArn,
      desiredCount: 1,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: ECS_SUBNETS,
          securityGroups: [ECS_SECURITY_GROUP],
          assignPublicIp: "DISABLED",
        },
      },
      loadBalancers: [
        {
          targetGroupArn,
          containerName: "app",
          containerPort: 8080,
        },
      ],
      // デプロイ中も最低1台は維持する
      deploymentConfiguration: {
        minimumHealthyPercent: 0,
        maximumPercent: 200,
      },
    })
  );

  return result.service?.serviceArn ?? "";
}

/**
 * ECSサービスのデプロイ状態を確認する
 */
export async function getServiceStatus(
  nickname: string,
  appName: string
): Promise<{
  status: "deploying" | "active" | "failed" | "not_found";
  runningCount: number;
  pendingCount: number;
  desiredCount: number;
  events: string[];
}> {
  const serviceName = getServiceName(nickname, appName);

  try {
    const result = await ecsClient.send(
      new DescribeServicesCommand({
        cluster: ECS_CLUSTER,
        services: [serviceName],
      })
    );

    const service = result.services?.[0];
    if (!service || service.status === "INACTIVE") {
      return {
        status: "not_found",
        runningCount: 0,
        pendingCount: 0,
        desiredCount: 0,
        events: [],
      };
    }

    const running = service.runningCount ?? 0;
    const desired = service.desiredCount ?? 0;
    const pending = service.pendingCount ?? 0;

    // 最新イベントを最大5件取得する
    const events = (service.events ?? [])
      .slice(0, 5)
      .map((e) => `[${e.createdAt?.toISOString()}] ${e.message}`);

    // サービス状態を判定する
    let status: "deploying" | "active" | "failed";
    if (running >= desired && desired > 0) {
      status = "active";
    } else if (
      events.some((e) =>
        e.includes("unable") || e.includes("failed") || e.includes("error")
      )
    ) {
      status = "failed";
    } else {
      status = "deploying";
    }

    return { status, runningCount: running, pendingCount: pending, desiredCount: desired, events };
  } catch {
    return {
      status: "not_found",
      runningCount: 0,
      pendingCount: 0,
      desiredCount: 0,
      events: [],
    };
  }
}

/**
 * ECSサービスとタスク定義、ターゲットグループを削除する
 */
export async function deleteApp(
  nickname: string,
  appName: string,
  targetGroupArn: string,
  ruleArn?: string
): Promise<void> {
  const serviceName = getServiceName(nickname, appName);

  // ECSサービスを停止・削除する（タスク数を0にしてから削除）
  try {
    await ecsClient.send(
      new UpdateServiceCommand({
        cluster: ECS_CLUSTER,
        service: serviceName,
        desiredCount: 0,
      })
    );
    await ecsClient.send(
      new DeleteServiceCommand({
        cluster: ECS_CLUSTER,
        service: serviceName,
        force: true,
      })
    );
  } catch {
    // サービスが存在しない場合は無視する
  }

  // ALBルールを削除する
  if (ruleArn) {
    try {
      await albClient.send(new DeleteRuleCommand({ RuleArn: ruleArn }));
    } catch {
      // ルールが存在しない場合は無視する
    }
  }

  // ターゲットグループを削除する
  if (targetGroupArn) {
    try {
      await albClient.send(
        new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn })
      );
    } catch {
      // ターゲットグループが存在しない場合は無視する
    }
  }

  // 古いタスク定義を全て登録解除する
  try {
    const family = serviceName;
    const taskDefs = await ecsClient.send(
      new ListTaskDefinitionsCommand({ familyPrefix: family })
    );
    for (const arn of taskDefs.taskDefinitionArns ?? []) {
      await ecsClient.send(
        new DeregisterTaskDefinitionCommand({ taskDefinition: arn })
      );
    }
  } catch {
    // タスク定義が存在しない場合は無視する
  }
}
