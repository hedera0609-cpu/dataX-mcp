/**
 * datax_publish ツール
 * アプリをECS Fargateにデプロイする（非同期）
 */

import { z } from "zod";
import { APP_NAME_REGEX } from "../constants.js";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";
import {
  generateDockerfile,
  DEFAULT_REQUIREMENTS_TXT,
} from "../deploy/dockerfile-generator.js";
import {
  detectAppFiles,
  readFileContent,
  listFiles,
} from "../deploy/s3-storage.js";
import {
  ensureEcrRepository,
  loginToEcr,
  buildAndPushImage,
  createTargetGroup,
  registerTaskDefinition,
  deployEcsService,
  createAlbRule,
} from "../deploy/ecs-deployer.js";
import {
  putApp,
  updateAppStatus,
  getApp,
} from "../db/client.js";

// =====================================
// datax_publish ツール入力スキーマ
// =====================================

export const publishSchema = z.object({
  app_name: z
    .string()
    .regex(
      APP_NAME_REGEX,
      "app_nameは英小文字・数字・ハイフンのみ使用可能です（先頭末尾は英数字、最大32文字）"
    )
    .describe("デプロイするアプリの名前"),
  description: z
    .string()
    .max(100, "説明は100文字以内にしてください")
    .describe(
      `アプリを配信します。配信前に必ず以下を確認してください。

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
datax_deploy_status で完了確認。完了まで通常 3〜5 分かかります。`
    ),
});

export type PublishInput = z.infer<typeof publishSchema> & {
  nickname: string;
};

/**
 * datax_publish ツールのハンドラ
 * S3からファイルを取得してDockerイメージをビルドし、ECSにデプロイする
 */
export async function handlePublish(input: PublishInput): Promise<string> {
  const { nickname, app_name, description } = input;

  // 既存アプリの状態を確認する
  const existing = await getApp(nickname, app_name);
  if (existing?.status === "deploying") {
    return JSON.stringify({
      success: false,
      message: "このアプリは現在デプロイ中です。datax_deploy_status で状態を確認してください。",
    });
  }

  // S3上のファイル構成を確認する
  const appFiles = await detectAppFiles(nickname, app_name);
  if (appFiles.fileList.length === 0) {
    return JSON.stringify({
      success: false,
      message:
        "デプロイするファイルが見つかりません。" +
        "datax_write_file でファイルをアップロードしてください。",
    });
  }

  // Dockerfileを生成する
  let dockerfileResult;
  try {
    dockerfileResult = generateDockerfile(appFiles);
  } catch (err) {
    return JSON.stringify({
      success: false,
      message: err instanceof Error ? err.message : "Dockerfileの生成に失敗しました",
    });
  }

  // DBに"deploying"ステータスで記録する
  await putApp({
    nickname,
    appName: app_name,
    status: "deploying",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    description,
    runtime: dockerfileResult.runtime,
  });

  // バックグラウンドでデプロイを実行する（非同期）
  runDeployAsync(nickname, app_name, dockerfileResult, appFiles).catch(
    async (err) => {
      console.error(`[datax] デプロイエラー: ${err.message}`);
      await updateAppStatus(
        nickname,
        app_name,
        "failed",
        undefined,
        `デプロイエラー: ${err.message}`
      );
    }
  );

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
async function runDeployAsync(
  nickname: string,
  appName: string,
  dockerfileResult: ReturnType<typeof generateDockerfile>,
  appFiles: Awaited<ReturnType<typeof detectAppFiles>>
): Promise<void> {
  // 一時ディレクトリにファイルを展開する
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `datax-${nickname}-${appName}-`)
  );

  try {
    // S3からファイルを一時ディレクトリにダウンロードする
    await downloadFilesToTmp(nickname, appName, appFiles.fileList, tmpDir);

    // requirements.txtが必要な場合は自動生成する
    if (dockerfileResult.needsRequirementsTxt) {
      fs.writeFileSync(
        path.join(tmpDir, "requirements.txt"),
        DEFAULT_REQUIREMENTS_TXT
      );
    }

    // 生成されたDockerfileを一時ディレクトリに書き込む
    if (dockerfileResult.content !== null) {
      fs.writeFileSync(
        path.join(tmpDir, "Dockerfile"),
        dockerfileResult.content
      );
    }

    await updateAppStatus(
      nickname,
      appName,
      "deploying",
      undefined,
      "ECRリポジトリを準備中..."
    );

    // ECRリポジトリを確保する
    const repositoryUri = await ensureEcrRepository(nickname, appName);

    await updateAppStatus(
      nickname,
      appName,
      "deploying",
      undefined,
      "Dockerイメージをビルド中..."
    );

    // ECRにログインしてDockerイメージをビルド・プッシュする
    await loginToEcr();
    const imageUri = await buildAndPushImage(
      nickname,
      appName,
      tmpDir,
      repositoryUri
    );

    await updateAppStatus(
      nickname,
      appName,
      "deploying",
      undefined,
      "ALBターゲットグループを作成中..."
    );

    // ALBターゲットグループを作成する
    const targetGroupArn = await createTargetGroup(nickname, appName);

    // ドメインが設定されている場合はALBルールも作成する（Phase 2）
    const domain = process.env.DATAX_DOMAIN;
    let serviceUrl: string;
    if (domain) {
      await createAlbRule(targetGroupArn, nickname, appName, domain);
      serviceUrl = `https://datax-${nickname}--${appName}.${domain}`;
    } else {
      // Phase 1: ALB DNSをそのまま返す
      serviceUrl = process.env.ALB_DNS_NAME
        ? `http://${process.env.ALB_DNS_NAME}`
        : "（ALB_DNS_NAMEが設定されていません）";
    }

    await updateAppStatus(
      nickname,
      appName,
      "deploying",
      serviceUrl,
      "ECSタスク定義を登録中..."
    );

    // ECSタスク定義を登録する
    const taskDefinitionArn = await registerTaskDefinition(
      nickname,
      appName,
      imageUri
    );

    await updateAppStatus(
      nickname,
      appName,
      "deploying",
      serviceUrl,
      "ECSサービスを起動中..."
    );

    // ECSサービスを起動する
    const serviceArn = await deployEcsService(
      nickname,
      appName,
      taskDefinitionArn,
      targetGroupArn
    );

    // デプロイ完了をDBに記録する
    await updateAppStatus(
      nickname,
      appName,
      "active",
      serviceUrl,
      "デプロイ完了",
      {
        ecsServiceArn: serviceArn,
        targetGroupArn,
        ecrRepositoryUri: repositoryUri,
      }
    );
  } finally {
    // 一時ディレクトリを必ず削除する
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // クリーンアップ失敗は無視する
    }
  }
}

/**
 * S3からファイルを一時ディレクトリにダウンロードする
 */
async function downloadFilesToTmp(
  nickname: string,
  appName: string,
  fileList: string[],
  tmpDir: string
): Promise<void> {
  for (const filePath of fileList) {
    const content = await readFileContent(nickname, appName, filePath);
    if (content === null) continue;

    const fullPath = path.join(tmpDir, filePath);
    const dir = path.dirname(fullPath);

    // サブディレクトリを作成する
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }
}
