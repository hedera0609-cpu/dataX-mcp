# DataX MCP セットアップガイド

> このファイルは、新しいPCでDataX MCPを使えるようにするための手順書です。  
> セキュリティ上の理由でGitに含められなかったファイルの作成方法を説明します。

---

## 除外されているファイル一覧

| ファイル | 理由 | 対応 |
|---------|------|------|
| `.env` | AWS認証情報を含む | 本ガイドの手順で作成する |
| `claude_mcp_config.json` | AWS認証情報を含む | 本ガイドの手順で作成する |

---

## 前提条件

以下がインストールされていること。

| ツール | バージョン | 確認コマンド |
|--------|-----------|-------------|
| Node.js | 18以上 | `node -v` |
| npm | 9以上 | `npm -v` |
| Docker | 任意 | `docker -v` |
| Claude Code | 最新 | `claude -v` |

---

## 手順

### 1. リポジトリのクローン

```bash
git clone git@github.com:hedera0609-cpu/dataX-mcp.git
cd dataX-mcp
```

### 2. 依存パッケージのインストール

```bash
npm install
```

### 3. TypeScriptのビルド

```bash
npm run build
```

ビルド後、`packages/mcp-server/dist/index.js` が生成されることを確認する。

---

### 4. `.env` ファイルの作成

`.env.example` をコピーして `.env` を作成する。

```bash
cp .env.example .env
```

`.env` を開いて以下の値を設定する。

#### 必須項目

```env
# 自分のニックネーム（英小文字・数字・ハイフンのみ、2〜22文字）
# ※ 他の人と重複しないようにすること（アプリの分離に使用される）
DATAX_NICKNAME=yourname

# AWS認証情報（IAMユーザーのアクセスキー）
# ※ 管理者から払い出してもらうこと
AWS_ACCESS_KEY_ID=（管理者から取得）
AWS_SECRET_ACCESS_KEY=（管理者から取得）
```

#### インフラ情報（既存のAWS環境に接続する場合）

> 現在の検証環境（個人AWSアカウント）の値です。  
> 会社アカウントへ移行した際はこの値を置き換えること。

```env
AWS_REGION=ap-northeast-2

ECR_REGISTRY=338246863726.dkr.ecr.ap-northeast-2.amazonaws.com
ECS_CLUSTER=datax-cluster
DYNAMODB_TABLE=datax-apps
S3_BUCKET=datax-app-sources-338246863726-ap-northeast-2

ALB_LISTENER_ARN=arn:aws:elasticloadbalancing:ap-northeast-2:338246863726:listener/app/datax-alb/627ae313abea33b7/c3488cde2a9c2497
ALB_DNS_NAME=datax-alb-1412551405.ap-northeast-2.elb.amazonaws.com

VPC_ID=vpc-0e09345bf817d5c8f
ECS_SUBNETS=subnet-0808b7b1eb326c12b,subnet-0170526270f4c437a
ECS_SECURITY_GROUP=sg-0c1a57282373d1a00

TASK_EXECUTION_ROLE_ARN=arn:aws:iam::338246863726:role/datax-task-execution-role
TASK_ROLE_ARN=arn:aws:iam::338246863726:role/datax-task-role
```

---

### 5. `claude_mcp_config.json` の作成

プロジェクトルートに `claude_mcp_config.json` を作成する。

```json
{
  "mcpServers": {
    "datax": {
      "command": "node",
      "args": ["/your/path/to/dataX-mcp/packages/mcp-server/dist/index.js"],
      "env": {
        "DATAX_NICKNAME": "（.envに設定したnicknameと同じ値）",
        "AWS_REGION": "ap-northeast-2",
        "AWS_ACCESS_KEY_ID": "（AWSアクセスキー）",
        "AWS_SECRET_ACCESS_KEY": "（AWSシークレットキー）",
        "ECR_REGISTRY": "338246863726.dkr.ecr.ap-northeast-2.amazonaws.com",
        "ECS_CLUSTER": "datax-cluster",
        "DYNAMODB_TABLE": "datax-apps",
        "S3_BUCKET": "datax-app-sources-338246863726-ap-northeast-2",
        "ALB_LISTENER_ARN": "arn:aws:elasticloadbalancing:ap-northeast-2:338246863726:listener/app/datax-alb/627ae313abea33b7/c3488cde2a9c2497",
        "ALB_DNS_NAME": "datax-alb-1412551405.ap-northeast-2.elb.amazonaws.com",
        "VPC_ID": "vpc-0e09345bf817d5c8f",
        "ECS_SUBNETS": "subnet-0808b7b1eb326c12b,subnet-0170526270f4c437a",
        "ECS_SECURITY_GROUP": "sg-0c1a57282373d1a00",
        "TASK_EXECUTION_ROLE_ARN": "arn:aws:iam::338246863726:role/datax-task-execution-role",
        "TASK_ROLE_ARN": "arn:aws:iam::338246863726:role/datax-task-role"
      }
    }
  }
}
```

> ⚠️ `args` の中のパスは **自分のPC上のフルパス** に書き換えること。  
> 例（Mac）: `/Users/yourname/dataX-mcp/packages/mcp-server/dist/index.js`  
> 例（Windows）: `C:/Users/yourname/dataX-mcp/packages/mcp-server/dist/index.js`

---

### 6. Claude Code への MCP 登録

`claude_mcp_config.json` の内容を Claude Code の設定に追記する。

#### 方法A: Claude Code CLIで登録（推奨）

```bash
claude mcp add datax node /your/path/to/dataX-mcp/packages/mcp-server/dist/index.js
```

その後、`~/.claude/settings.json` を開いて `env` セクションに環境変数を追加する。

#### 方法B: settings.json に直接追記

`~/.claude/settings.json` を開き、`mcpServers` セクションに `claude_mcp_config.json` の内容をマージする。

---

### 7. 動作確認

Claude Code を再起動して、以下のプロンプトで確認する。

```
datax_listを呼び出して、アプリ一覧を見せて
```

正常に応答が返れば設定完了。

---

## AWS IAM 権限について

接続するIAMユーザーには以下の権限が必要です。管理者に申請してください。

```
ecr:GetAuthorizationToken
ecr:BatchGetImage
ecr:CreateRepository
ecr:DescribeRepositories
ecr:InitiateLayerUpload / UploadLayerPart / CompleteLayerUpload / PutImage

ecs:RegisterTaskDefinition / DeregisterTaskDefinition
ecs:CreateService / UpdateService / DeleteService
ecs:DescribeServices / ListTaskDefinitions

elasticloadbalancing:CreateTargetGroup / DeleteTargetGroup
elasticloadbalancing:CreateRule / DeleteRule
elasticloadbalancing:DescribeRules / DescribeTargetGroups

s3:PutObject / GetObject / DeleteObject / ListBucket
dynamodb:PutItem / GetItem / UpdateItem / Query
```

---

## 会社アカウントへの移行時

個人検証環境（AWSアカウント: 338246863726）から会社アカウントに移行する場合は、
以下の手順が必要です。

1. `infra/` ディレクトリで CDK をデプロイする
   ```bash
   cd infra
   npm install
   # .env に ALLOWED_OFFICE_IP, ALLOWED_VPN_IP, CDK_DEFAULT_ACCOUNT を設定する
   npx cdk bootstrap
   npx cdk deploy --all
   ```

2. デプロイ後に出力されるリソースIDを `.env` と `claude_mcp_config.json` に反映する

3. アクセス元IPを `ALLOWED_OFFICE_IP` / `ALLOWED_VPN_IP` に設定する

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `DATAX_NICKNAME が設定されていません` | env未設定 | `claude_mcp_config.json` の `DATAX_NICKNAME` を確認 |
| `Could not read from remote repository` | SSH鍵未設定 | HTTPS URLでcloneし直す |
| `dist/index.js が見つからない` | ビルド未実施 | `npm run build` を実行 |
| デプロイが5分以上かかる | ECS起動遅延 | `datax_deploy_status` で状態を確認（正常範囲） |
| `AccessDenied` エラー | IAM権限不足 | 上記の権限リストを管理者に申請 |
