"use strict";
/**
 * datax_publish ツール
 * アプリをECS Fargateにデプロイする（非同期）
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishSchema = void 0;
exports.handlePublish = handlePublish;
const zod_1 = require("zod");
const constants_js_1 = require("../constants.js");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const dockerfile_generator_js_1 = require("../deploy/dockerfile-generator.js");
const s3_storage_js_1 = require("../deploy/s3-storage.js");
const ecs_deployer_js_1 = require("../deploy/ecs-deployer.js");
const client_js_1 = require("../db/client.js");
// =====================================
// datax_publish ツール入力スキーマ
// =====================================
exports.publishSchema = zod_1.z.object({
    app_name: zod_1.z
        .string()
        .regex(constants_js_1.APP_NAME_REGEX, "app_nameは英小文字・数字・ハイフンのみ使用可能です（先頭末尾は英数字、最大32文字）")
        .describe("デプロイするアプリの名前"),
    description: zod_1.z
        .string()
        .max(100, "説明は100文字以内にしてください")
        .describe(`アプリを配信します。配信前に必ず以下を確認してください。

[ランタイム自動検出]
- Python: *.py ファイルが存在する場合。app.py または main.py がエントリーポイント。PORT 環境変数必須。
- Java: *.java または pom.xml が存在する場合。Dockerfile の直接作成が必要。
- Node.js: package.json が存在する場合。"start" スクリプト必須。PORT 環境変数必須。
- 静的 HTML: .html ファイルのみの場合。nginx で配信。

[配信前チェックリスト]
1. UI Kit の適用: datax_read_file で ui-kit/README.md を必ず先に読み、CSS/JS を適用すること
2. DB を使用する場合: datax-db.js SDK を script タグでロードすること（ローカル↔DynamoDB 自動切替）
3. PORT: すべてのサーバーは環境変数 PORT（デフォルト 8080）を使用すること

[ファイル転送方法]
- 小規模アプリ（ファイル5件以下、各200行以下）: datax_write_file を使用
- その他: datax_init_repo で git リポジトリを初期化してから git push を使用

[配信後]
datax_deploy_status で完了確認。完了まで通常 3〜5 分かかります。`),
});
/**
 * datax_publish ツールのハンドラ
 * S3からファイルを取得してDockerイメージをビルドし、ECSにデプロイする
 */
async function handlePublish(input) {
    const { nickname, app_name, description } = input;
    // 既存アプリの状態を確認する
    const existing = await (0, client_js_1.getApp)(nickname, app_name);
    if (existing?.status === "deploying") {
        return JSON.stringify({
            success: false,
            message: "このアプリは現在デプロイ中です。datax_deploy_status で状態を確認してください。",
        });
    }
    // S3上のファイル構成を確認する
    const appFiles = await (0, s3_storage_js_1.detectAppFiles)(nickname, app_name);
    if (appFiles.fileList.length === 0) {
        return JSON.stringify({
            success: false,
            message: "デプロイするファイルが見つかりません。" +
                "datax_write_file でファイルをアップロードしてください。",
        });
    }
    // Dockerfileを生成する
    let dockerfileResult;
    try {
        dockerfileResult = (0, dockerfile_generator_js_1.generateDockerfile)(appFiles);
    }
    catch (err) {
        return JSON.stringify({
            success: false,
            message: err instanceof Error ? err.message : "Dockerfileの生成に失敗しました",
        });
    }
    // DBに"deploying"ステータスで記録する
    await (0, client_js_1.putApp)({
        nickname,
        appName: app_name,
        status: "deploying",
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        description,
        runtime: dockerfileResult.runtime,
    });
    // バックグラウンドでデプロイを実行する（非同期）
    runDeployAsync(nickname, app_name, dockerfileResult, appFiles).catch(async (err) => {
        console.error(`[datax] デプロイエラー: ${err.message}`);
        await (0, client_js_1.updateAppStatus)(nickname, app_name, "failed", undefined, `デプロイエラー: ${err.message}`);
    });
    return JSON.stringify({
        success: true,
        message: "デプロイを開始しました。datax_deploy_status で進捗を確認してください。",
        app_name,
        runtime: dockerfileResult.runtime,
        file_count: appFiles.fileList.length,
        estimated_minutes: 3,
        status_check: `datax_deploy_status を使用して app_name="${app_name}" の状態を確認してください`,
    });
}
/**
 * 非同期デプロイの実行本体
 * ECRへのプッシュ → ALBターゲットグループ作成 → ECSサービス起動 の順で実行する
 */
async function runDeployAsync(nickname, appName, dockerfileResult, appFiles) {
    // 一時ディレクトリにファイルを展開する
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `datax-${nickname}-${appName}-`));
    try {
        // S3からファイルを一時ディレクトリにダウンロードする
        await downloadFilesToTmp(nickname, appName, appFiles.fileList, tmpDir);
        // requirements.txtが必要な場合は自動生成する
        if (dockerfileResult.needsRequirementsTxt) {
            fs.writeFileSync(path.join(tmpDir, "requirements.txt"), dockerfile_generator_js_1.DEFAULT_REQUIREMENTS_TXT);
        }
        // 生成されたDockerfileを一時ディレクトリに書き込む
        if (dockerfileResult.content !== null) {
            fs.writeFileSync(path.join(tmpDir, "Dockerfile"), dockerfileResult.content);
        }
        await (0, client_js_1.updateAppStatus)(nickname, appName, "deploying", undefined, "ECRリポジトリを準備中...");
        // ECRリポジトリを確保する
        const repositoryUri = await (0, ecs_deployer_js_1.ensureEcrRepository)(nickname, appName);
        await (0, client_js_1.updateAppStatus)(nickname, appName, "deploying", undefined, "Dockerイメージをビルド中...");
        // ECRにログインしてDockerイメージをビルド・プッシュする
        await (0, ecs_deployer_js_1.loginToEcr)();
        const imageUri = await (0, ecs_deployer_js_1.buildAndPushImage)(nickname, appName, tmpDir, repositoryUri);
        await (0, client_js_1.updateAppStatus)(nickname, appName, "deploying", undefined, "ALBターゲットグループを作成中...");
        // ALBターゲットグループを作成する
        const targetGroupArn = await (0, ecs_deployer_js_1.createTargetGroup)(nickname, appName);
        // ドメインが設定されている場合はALBルールも作成する（Phase 2）
        const domain = process.env.DATAX_DOMAIN;
        let serviceUrl;
        if (domain) {
            await (0, ecs_deployer_js_1.createAlbRule)(targetGroupArn, nickname, appName, domain);
            serviceUrl = `https://datax-${nickname}--${appName}.${domain}`;
        }
        else {
            // Phase 1: ALB DNSをそのまま返す
            serviceUrl = process.env.ALB_DNS_NAME
                ? `http://${process.env.ALB_DNS_NAME}`
                : "（ALB_DNS_NAMEが設定されていません）";
        }
        await (0, client_js_1.updateAppStatus)(nickname, appName, "deploying", serviceUrl, "ECSタスク定義を登録中...");
        // ECSタスク定義を登録する
        const taskDefinitionArn = await (0, ecs_deployer_js_1.registerTaskDefinition)(nickname, appName, imageUri);
        await (0, client_js_1.updateAppStatus)(nickname, appName, "deploying", serviceUrl, "ECSサービスを起動中...");
        // ECSサービスを起動する
        const serviceArn = await (0, ecs_deployer_js_1.deployEcsService)(nickname, appName, taskDefinitionArn, targetGroupArn);
        // デプロイ完了をDBに記録する
        await (0, client_js_1.updateAppStatus)(nickname, appName, "active", serviceUrl, "デプロイ完了", {
            ecsServiceArn: serviceArn,
            targetGroupArn,
            ecrRepositoryUri: repositoryUri,
        });
    }
    finally {
        // 一時ディレクトリを必ず削除する
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
        catch {
            // クリーンアップ失敗は無視する
        }
    }
}
/**
 * S3からファイルを一時ディレクトリにダウンロードする
 */
async function downloadFilesToTmp(nickname, appName, fileList, tmpDir) {
    for (const filePath of fileList) {
        const content = await (0, s3_storage_js_1.readFileContent)(nickname, appName, filePath);
        if (content === null)
            continue;
        const fullPath = path.join(tmpDir, filePath);
        const dir = path.dirname(fullPath);
        // サブディレクトリを作成する
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content, "utf-8");
    }
}
//# sourceMappingURL=publish.js.map