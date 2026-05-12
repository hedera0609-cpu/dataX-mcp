/**
 * CDK アプリ エントリーポイント
 * 環境変数からIP・ドメインを読み込んでスタックを構築する
 */

import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack.js";
import { DynamoDbStack } from "../lib/dynamodb-stack.js";
import { EcsStack } from "../lib/ecs-stack.js";
import { DnsStack } from "../lib/dns-stack.js";

// =====================================
// 環境変数のバリデーション
// =====================================

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `必須環境変数 "${name}" が設定されていません。.env.example を参照してください。`
    );
  }
  return val;
}

// 必須環境変数
const ALLOWED_OFFICE_IP = requireEnv("ALLOWED_OFFICE_IP");
const ALLOWED_VPN_IP = requireEnv("ALLOWED_VPN_IP");
const AWS_ACCOUNT = requireEnv("CDK_DEFAULT_ACCOUNT");
const AWS_REGION = process.env.AWS_REGION ?? "ap-northeast-2";

// オプション環境変数（Phase 2で必要）
const DATAX_DOMAIN = process.env.DATAX_DOMAIN;
const ACM_CERTIFICATE_ARN = process.env.ACM_CERTIFICATE_ARN;

// =====================================
// CDK アプリの初期化
// =====================================

const app = new cdk.App();

const env: cdk.Environment = {
  account: AWS_ACCOUNT,
  region: AWS_REGION,
};

// =====================================
// Phase 1: ネットワーク + DynamoDB + ECS
// =====================================

// ネットワークスタック（VPC・セキュリティグループ）
const networkStack = new NetworkStack(app, "DataXNetworkStack", {
  env,
  allowedOfficeIp: ALLOWED_OFFICE_IP,
  allowedVpnIp: ALLOWED_VPN_IP,
  description: "DataX VPC, Security Groups, IP restrictions",
  tags: { Project: "DataX", Phase: "1" },
});

// DynamoDB + S3 スタック
const dynamoStack = new DynamoDbStack(app, "DataXDynamoDbStack", {
  env,
  description: "DataX app state management DynamoDB + S3",
  tags: { Project: "DataX", Phase: "1" },
});

// ECS クラスター + ALB スタック
const ecsStack = new EcsStack(app, "DataXEcsStack", {
  env,
  networkStack,
  sourceBucket: dynamoStack.sourceBucket,
  appsTable: dynamoStack.appsTable,
  // Phase 2でACM証明書ARNを設定する（今はオプション）
  certificateArn: ACM_CERTIFICATE_ARN,
  description: "DataX ECS cluster and ALB",
  tags: { Project: "DataX", Phase: "1" },
});

// スタック間の依存関係を明示する
ecsStack.addDependency(networkStack);
ecsStack.addDependency(dynamoStack);

// =====================================
// Phase 2: DNS + SSL 証明書
// DATAX_DOMAIN が設定されている場合のみ作成する
// =====================================

if (DATAX_DOMAIN) {
  const dnsStack = new DnsStack(app, "DataXDnsStack", {
    // ACM証明書はus-east-1に作成する（ALBワイルドカード証明書の要件）
    env: { account: AWS_ACCOUNT, region: "us-east-1" },
    domain: DATAX_DOMAIN,
    alb: ecsStack.alb,
    description: "DataX Route53 and ACM certificate (Phase 2)",
    tags: { Project: "DataX", Phase: "2" },
    crossRegionReferences: true,
  });

  dnsStack.addDependency(ecsStack);
}

app.synth();
