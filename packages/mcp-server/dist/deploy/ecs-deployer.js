"use strict";
/**
 * ECS デプロイモジュール
 * ECRへのイメージプッシュとECSサービスの作成・管理を担当する
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureEcrRepository = ensureEcrRepository;
exports.loginToEcr = loginToEcr;
exports.buildAndPushImage = buildAndPushImage;
exports.createTargetGroup = createTargetGroup;
exports.createAlbRule = createAlbRule;
exports.registerTaskDefinition = registerTaskDefinition;
exports.deployEcsService = deployEcsService;
exports.getServiceStatus = getServiceStatus;
exports.deleteApp = deleteApp;
const client_ecr_1 = require("@aws-sdk/client-ecr");
const client_ecs_1 = require("@aws-sdk/client-ecs");
const client_elastic_load_balancing_v2_1 = require("@aws-sdk/client-elastic-load-balancing-v2");
const child_process_1 = require("child_process");
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
const ecrClient = new client_ecr_1.ECRClient({ region: AWS_REGION });
const ecsClient = new client_ecs_1.ECSClient({ region: AWS_REGION });
const albClient = new client_elastic_load_balancing_v2_1.ElasticLoadBalancingV2Client({ region: AWS_REGION });
/**
 * アプリ名からECRリポジトリ名を生成する
 */
function getRepositoryName(nickname, appName) {
    return `datax/${nickname}/${appName}`;
}
/**
 * アプリ名からECSサービス名を生成する
 */
function getServiceName(nickname, appName) {
    return `datax-${nickname}-${appName}`;
}
/**
 * ECRリポジトリを取得または作成する
 * リポジトリが存在しない場合は新規作成する
 */
async function ensureEcrRepository(nickname, appName) {
    const repoName = getRepositoryName(nickname, appName);
    try {
        // 既存リポジトリを確認する
        const result = await ecrClient.send(new client_ecr_1.DescribeRepositoriesCommand({ repositoryNames: [repoName] }));
        return result.repositories?.[0]?.repositoryUri ?? "";
    }
    catch {
        // リポジトリが存在しない場合は新規作成する
        const result = await ecrClient.send(new client_ecr_1.CreateRepositoryCommand({
            repositoryName: repoName,
            imageScanningConfiguration: { scanOnPush: true },
            imageTagMutability: "MUTABLE",
        }));
        return result.repository?.repositoryUri ?? "";
    }
}
/**
 * ECR認証トークンを取得してDockerにログインする
 */
async function loginToEcr() {
    const result = await ecrClient.send(new client_ecr_1.GetAuthorizationTokenCommand({}));
    const authData = result.authorizationData?.[0];
    if (!authData?.authorizationToken || !authData.proxyEndpoint) {
        throw new Error("ECR認証トークンの取得に失敗しました");
    }
    // Base64デコードしてユーザー名とパスワードを分離する
    const decoded = Buffer.from(authData.authorizationToken, "base64").toString();
    const [username, password] = decoded.split(":");
    (0, child_process_1.execSync)(`echo ${password} | docker login --username ${username} --password-stdin ${authData.proxyEndpoint}`, { stdio: "pipe" });
}
/**
 * DockerイメージをビルドしてECRにプッシュする
 * S3から取得済みのファイルが一時ディレクトリに展開済みであることを前提とする
 */
async function buildAndPushImage(nickname, appName, buildDir, repositoryUri) {
    const imageTag = `${repositoryUri}:latest`;
    // Dockerイメージをビルドする
    (0, child_process_1.execSync)(`docker build -t ${imageTag} ${buildDir}`, {
        stdio: "pipe",
        timeout: 300_000, // 5分タイムアウト
    });
    // ECRにプッシュする
    (0, child_process_1.execSync)(`docker push ${imageTag}`, {
        stdio: "pipe",
        timeout: 120_000, // 2分タイムアウト
    });
    return imageTag;
}
/**
 * ALBターゲットグループを作成する
 * アプリごとに独立したターゲットグループを作成する
 */
async function createTargetGroup(nickname, appName) {
    const tgName = `datax-${nickname}-${appName}`.slice(0, 32);
    const result = await albClient.send(new client_elastic_load_balancing_v2_1.CreateTargetGroupCommand({
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
    }));
    return result.TargetGroups?.[0]?.TargetGroupArn ?? "";
}
/**
 * ALBリスナールールを作成する
 * ホストヘッダーパターンでルーティングする（Phase 2で使用）
 * Phase 1ではパスベースルーティングを使用する
 */
async function createAlbRule(targetGroupArn, nickname, appName, domain) {
    // 既存ルールの優先度を確認して重複しない番号を割り当てる
    const existingRules = await albClient.send(new client_elastic_load_balancing_v2_1.DescribeRulesCommand({ ListenerArn: ALB_LISTENER_ARN }));
    const usedPriorities = new Set(existingRules.Rules?.map((r) => Number(r.Priority)).filter((p) => !isNaN(p)) ?? []);
    // 空き優先度番号を探す（1〜999の範囲）
    let priority = 1;
    while (usedPriorities.has(priority))
        priority++;
    const hostPattern = `datax-${nickname}--${appName}.${domain}`;
    const result = await albClient.send(new client_elastic_load_balancing_v2_1.CreateRuleCommand({
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
    }));
    return result.Rules?.[0]?.RuleArn ?? "";
}
/**
 * ECSタスク定義を登録する
 */
async function registerTaskDefinition(nickname, appName, imageUri) {
    const family = getServiceName(nickname, appName);
    const result = await ecsClient.send(new client_ecs_1.RegisterTaskDefinitionCommand({
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
    }));
    return result.taskDefinition?.taskDefinitionArn ?? "";
}
/**
 * ECSサービスを作成または更新する
 */
async function deployEcsService(nickname, appName, taskDefinitionArn, targetGroupArn) {
    const serviceName = getServiceName(nickname, appName);
    // 既存サービスの確認
    const existing = await ecsClient.send(new client_ecs_1.DescribeServicesCommand({
        cluster: ECS_CLUSTER,
        services: [serviceName],
    }));
    const activeService = existing.services?.find((s) => s.status !== "INACTIVE");
    if (activeService) {
        // 既存サービスを更新する
        const result = await ecsClient.send(new client_ecs_1.UpdateServiceCommand({
            cluster: ECS_CLUSTER,
            service: serviceName,
            taskDefinition: taskDefinitionArn,
            forceNewDeployment: true,
        }));
        return result.service?.serviceArn ?? "";
    }
    // 新規サービスを作成する
    const result = await ecsClient.send(new client_ecs_1.CreateServiceCommand({
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
    }));
    return result.service?.serviceArn ?? "";
}
/**
 * ECSサービスのデプロイ状態を確認する
 */
async function getServiceStatus(nickname, appName) {
    const serviceName = getServiceName(nickname, appName);
    try {
        const result = await ecsClient.send(new client_ecs_1.DescribeServicesCommand({
            cluster: ECS_CLUSTER,
            services: [serviceName],
        }));
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
        let status;
        if (running >= desired && desired > 0) {
            status = "active";
        }
        else if (events.some((e) => e.includes("unable") || e.includes("failed") || e.includes("error"))) {
            status = "failed";
        }
        else {
            status = "deploying";
        }
        return { status, runningCount: running, pendingCount: pending, desiredCount: desired, events };
    }
    catch {
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
async function deleteApp(nickname, appName, targetGroupArn, ruleArn) {
    const serviceName = getServiceName(nickname, appName);
    // ECSサービスを停止・削除する（タスク数を0にしてから削除）
    try {
        await ecsClient.send(new client_ecs_1.UpdateServiceCommand({
            cluster: ECS_CLUSTER,
            service: serviceName,
            desiredCount: 0,
        }));
        await ecsClient.send(new client_ecs_1.DeleteServiceCommand({
            cluster: ECS_CLUSTER,
            service: serviceName,
            force: true,
        }));
    }
    catch {
        // サービスが存在しない場合は無視する
    }
    // ALBルールを削除する
    if (ruleArn) {
        try {
            await albClient.send(new client_elastic_load_balancing_v2_1.DeleteRuleCommand({ RuleArn: ruleArn }));
        }
        catch {
            // ルールが存在しない場合は無視する
        }
    }
    // ターゲットグループを削除する
    if (targetGroupArn) {
        try {
            await albClient.send(new client_elastic_load_balancing_v2_1.DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }));
        }
        catch {
            // ターゲットグループが存在しない場合は無視する
        }
    }
    // 古いタスク定義を全て登録解除する
    try {
        const family = serviceName;
        const taskDefs = await ecsClient.send(new client_ecs_1.ListTaskDefinitionsCommand({ familyPrefix: family }));
        for (const arn of taskDefs.taskDefinitionArns ?? []) {
            await ecsClient.send(new client_ecs_1.DeregisterTaskDefinitionCommand({ taskDefinition: arn }));
        }
    }
    catch {
        // タスク定義が存在しない場合は無視する
    }
}
//# sourceMappingURL=ecs-deployer.js.map