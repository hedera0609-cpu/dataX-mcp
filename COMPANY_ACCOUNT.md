# 会社アカウント移行ガイド

> 個人検証環境（AWSアカウント: 338246863726）から会社AWSアカウントへ移行する際の手順書。  
> IAMロール作成権限がない環境を前提としています。

---

## 移行の全体像

```
Step 1: インフラチームにIAMロール2つの作成を依頼
Step 2: 自分でCDKデプロイ用の権限を申請
Step 3: CDKコードを修正（ロール自動生成 → 既存ロール参照に変更）
Step 4: CDKデプロイ（インフラ構築）
Step 5: .env と claude_mcp_config.json を新しい値に更新
Step 6: 同僚には日常使用権限のみ付与
```

---

## Step 1: インフラチームへのIAMロール作成依頼

以下の2つのロールの作成をインフラチームに依頼してください。

### ロール① datax-task-execution-role

ECSタスクがECRからDockerイメージを取得するためのロール。

**Trust Policy（信頼ポリシー）:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

**Permissions Policy（権限ポリシー）:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:CreateLogGroup"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/datax/*"
    }
  ]
}
```

---

### ロール② datax-task-role

ECSタスク（アプリ本体）がS3・DynamoDBにアクセスするためのロール。

**Trust Policy（信頼ポリシー）:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

**Permissions Policy（権限ポリシー）:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::datax-app-sources-*",
        "arn:aws:s3:::datax-app-sources-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/datax-apps"
    }
  ]
}
```

> ロールが作成されたら **ARN** を2つ受け取り、`.env` の  
> `TASK_EXECUTION_ROLE_ARN` と `TASK_ROLE_ARN` に設定してください。

---

## Step 2: 自分が申請する権限

### CDKデプロイ用（1回のみ使用）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:CreateVpc", "ec2:DeleteVpc",
        "ec2:CreateSubnet", "ec2:DeleteSubnet",
        "ec2:CreateInternetGateway", "ec2:DeleteInternetGateway",
        "ec2:AttachInternetGateway", "ec2:DetachInternetGateway",
        "ec2:CreateRouteTable", "ec2:DeleteRouteTable",
        "ec2:CreateRoute", "ec2:AssociateRouteTable",
        "ec2:AllocateAddress", "ec2:ReleaseAddress",
        "ec2:CreateNatGateway", "ec2:DeleteNatGateway",
        "ec2:CreateSecurityGroup", "ec2:DeleteSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress",
        "ec2:Describe*", "ec2:ModifyVpcAttribute",
        "ec2:CreateTags"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:CreateCluster", "ecs:DeleteCluster",
        "ecs:DescribeClusters", "ecs:PutClusterCapacityProviders"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "elasticloadbalancing:CreateLoadBalancer",
        "elasticloadbalancing:DeleteLoadBalancer",
        "elasticloadbalancing:CreateListener",
        "elasticloadbalancing:DeleteListener",
        "elasticloadbalancing:ModifyListener",
        "elasticloadbalancing:Describe*",
        "elasticloadbalancing:AddTags"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable", "dynamodb:DeleteTable",
        "dynamodb:DescribeTable", "dynamodb:UpdateTable",
        "dynamodb:UpdateContinuousBackups",
        "dynamodb:TagResource"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket", "s3:DeleteBucket",
        "s3:PutBucketVersioning", "s3:PutBucketPolicy",
        "s3:PutBucketPublicAccessBlock",
        "s3:PutLifecycleConfiguration",
        "s3:GetBucketLocation", "s3:GetBucketVersioning",
        "s3:ListBucket"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack", "cloudformation:UpdateStack",
        "cloudformation:DeleteStack", "cloudformation:DescribeStacks",
        "cloudformation:GetTemplate", "cloudformation:ValidateTemplate",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResources",
        "cloudformation:CreateChangeSet", "cloudformation:ExecuteChangeSet",
        "cloudformation:DescribeChangeSet"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": [
        "arn:aws:iam::*:role/datax-task-execution-role",
        "arn:aws:iam::*:role/datax-task-role"
      ]
    }
  ]
}
```

### 日常MCP使用権限（同僚全員に付与）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:CreateRepository",
        "ecr:DescribeRepositories",
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:RegisterTaskDefinition",
        "ecs:DeregisterTaskDefinition",
        "ecs:CreateService",
        "ecs:UpdateService",
        "ecs:DeleteService",
        "ecs:DescribeServices",
        "ecs:ListTaskDefinitions"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "elasticloadbalancing:CreateTargetGroup",
        "elasticloadbalancing:DeleteTargetGroup",
        "elasticloadbalancing:CreateRule",
        "elasticloadbalancing:DeleteRule",
        "elasticloadbalancing:DescribeRules",
        "elasticloadbalancing:DescribeTargetGroups"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject", "s3:GetObject",
        "s3:DeleteObject", "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::datax-app-sources-*",
        "arn:aws:s3:::datax-app-sources-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem", "dynamodb:GetItem",
        "dynamodb:UpdateItem", "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/datax-apps"
    },
    {
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": [
        "arn:aws:iam::*:role/datax-task-execution-role",
        "arn:aws:iam::*:role/datax-task-role"
      ]
    }
  ]
}
```

---

## Step 3: CDKコードの修正

インフラチームがロールを作成したら、CDKコードを修正して既存ロールを参照するようにします。

`infra/lib/ecs-stack.ts` の該当箇所を以下のように変更してください：

**変更前（自動生成）:**
```typescript
const executionRole = new iam.Role(this, 'TaskExecutionRole', {
  assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonECSTaskExecutionRolePolicy'),
  ],
});
```

**変更後（既存ロール参照）:**
```typescript
const executionRole = iam.Role.fromRoleArn(
  this, 'TaskExecutionRole',
  process.env.TASK_EXECUTION_ROLE_ARN!
);
const taskRole = iam.Role.fromRoleArn(
  this, 'TaskRole',
  process.env.TASK_ROLE_ARN!
);
```

> ※ 実際のコード変更はClaude Codeに「会社アカウント用にCDKコードを修正して」と依頼すると自動で対応します。

---

## Step 4: CDKデプロイ

```bash
cd infra

# .envに以下を追加する
# TASK_EXECUTION_ROLE_ARN=（インフラチームから受け取ったARN）
# TASK_ROLE_ARN=（インフラチームから受け取ったARN）
# ALLOWED_OFFICE_IP=xxx.xxx.xxx.xxx/32
# ALLOWED_VPN_IP=xxx.xxx.xxx.xxx/32
# CDK_DEFAULT_ACCOUNT=（会社のAWSアカウントID）

npx cdk bootstrap
npx cdk deploy DataXNetworkStack
npx cdk deploy DataXDynamoDBStack
npx cdk deploy DataXECSStack
```

---

## Step 5: .envとclaude_mcp_config.jsonの更新

CDKデプロイ後に出力される値を `.env` と `claude_mcp_config.json` に反映します。  
具体的な値の確認方法：

```bash
# CloudFormationのOutputsから確認する
aws cloudformation describe-stacks --stack-name DataXECSStack \
  --query 'Stacks[0].Outputs'
```

---

## まとめ（依頼内容一覧）

| 依頼先 | 依頼内容 |
|--------|---------|
| インフラチーム | IAMロール2つ作成（上記ポリシーJSON添付） |
| 権限管理者（自分） | CDKデプロイ用権限ポリシーを自分のIAMユーザーに付与 |
| 同僚 | 日常MCP使用権限ポリシーを各自のIAMユーザーに付与 |
