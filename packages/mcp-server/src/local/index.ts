/**
 * DataX MCP サーバー（ローカルモード）
 * AWSを使わず、ローカルのDockerとファイルシステムでアプリを動かす
 *
 * [必要なもの]
 * - Docker Desktop（起動済みであること）
 * - Node.js 18以上
 * - DATAX_NICKNAME 環境変数
 *
 * [制限事項]
 * - アプリは localhost:{ポート} でのみアクセス可能
 * - PCを閉じるとアプリも停止する（docker restart unless-stopped で自動再起動）
 * - ポート範囲: 18100〜18199（最大100アプリ）
 */

// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

import {
  getApp, putApp, listApps, updateAppStatus, softDeleteApp,
} from "./db.js";
import {
  writeFile, readFileContent, listFiles, deleteAppFiles,
  detectAppFiles, copyToDir,
} from "./storage.js";
import {
  buildAndRunContainer, getContainerStatus,
  stopAndRemoveContainer, getContainerLogs, getNextAvailablePort,
} from "./deployer.js";
import {
  generateDockerfile, DEFAULT_REQUIREMENTS_TXT,
} from "../deploy/dockerfile-generator.js";
import { APP_NAME_REGEX, sanitizePath, scanForSecrets } from "../constants.js";

// =====================================
// 起動時バリデーション
// =====================================

const NICKNAME = process.env.DATAX_NICKNAME;
if (!NICKNAME) {
  console.error(
    "[DataX Local] 環境変数 DATAX_NICKNAME が設定されていません。"
  );
  process.exit(1);
}

if (!/^[a-z0-9][a-z0-9-]{0,20}[a-z0-9]$/.test(NICKNAME)) {
  console.error(`[DataX Local] DATAX_NICKNAME "${NICKNAME}" の形式が正しくありません。`);
  process.exit(1);
}

// Dockerが起動しているか確認する
try {
  execSync("docker info", { stdio: "pipe" });
} catch {
  console.error("[DataX Local] Dockerが起動していません。Docker Desktopを起動してください。");
  process.exit(1);
}

// =====================================
// MCPサーバー初期化
// =====================================

const server = new McpServer({
  name: "datax-local",
  version: "1.0.0",
});

// =====================================
// datax_publish — ローカルDockerにデプロイ
// =====================================

server.registerTool(
  "datax_publish",
  {
    description: `アプリをローカルDockerにデプロイします（localhost:{ポート} でアクセス可能）。

[ランタイム自動検出]
- Python: *.py ファイルが存在する場合。PORT環境変数必須。
- Node.js: package.json が存在する場合。startスクリプト必須。PORT環境変数必須。
- 静的HTML: .htmlファイルのみの場合。nginxで配信。
- カスタム: Dockerfileが存在する場合。

[配信前チェックリスト]
1. UI Kitの適用: datax_read_file で ui-kit/README.md を先に読むこと
2. DBを使う場合: DataXDB SDKをscriptタグでロードすること（localhost → localStorage自動切替）
3. PORT: すべてのサーバーは環境変数PORT（デフォルト8080）を使用すること

[配信後]
datax_deploy_status で完了確認。通常30秒〜2分で完了します（AWS版より高速）。`,
    inputSchema: z.object({
      app_name: z.string().regex(APP_NAME_REGEX).describe("デプロイするアプリ名"),
      description: z.string().max(100).describe("アプリの説明"),
    }).shape,
  },
  async (args: any) => {
    const { app_name, description } = args;
    const nickname = NICKNAME;

    // 既存アプリがデプロイ中でないか確認する
    const existing = getApp(nickname, app_name);
    if (existing?.status === "deploying") {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            message: "このアプリは現在デプロイ中です。datax_deploy_status で状態を確認してください。",
          }),
        }],
      };
    }

    // ファイルが存在するか確認する
    const appFiles = detectAppFiles(nickname, app_name);
    if (appFiles.fileList.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            message: "デプロイするファイルが見つかりません。datax_write_file でファイルをアップロードしてください。",
          }),
        }],
      };
    }

    // Dockerfileを生成する
    let dockerfileResult;
    try {
      dockerfileResult = generateDockerfile(appFiles);
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            message: err instanceof Error ? err.message : "Dockerfileの生成に失敗しました",
          }),
        }],
      };
    }

    // DBにdeployingステータスで記録する
    putApp({
      nickname,
      appName: app_name,
      status: "deploying",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      description,
      runtime: dockerfileResult.runtime,
    });

    // バックグラウンドで非同期デプロイを実行する
    (async () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `datax-local-${nickname}-${app_name}-`)
      );
      try {
        // ソースをtmpDirにコピーする
        copyToDir(nickname, app_name, tmpDir);

        // requirements.txtが必要な場合は自動生成する
        if (dockerfileResult.needsRequirementsTxt) {
          fs.writeFileSync(
            path.join(tmpDir, "requirements.txt"),
            DEFAULT_REQUIREMENTS_TXT
          );
        }

        // Dockerfileを書き込む
        if (dockerfileResult.content !== null) {
          fs.writeFileSync(path.join(tmpDir, "Dockerfile"), dockerfileResult.content);
        }

        updateAppStatus(nickname, app_name, "deploying", undefined, "Dockerイメージをビルド中...");

        // コンテナをビルド・起動する
        const port = await buildAndRunContainer(nickname, app_name, tmpDir);
        const serviceUrl = `http://localhost:${port}`;

        updateAppStatus(nickname, app_name, "active", serviceUrl, "デプロイ完了", { localPort: port });
      } catch (err: any) {
        console.error(`[datax-local] デプロイエラー: ${err.message}`);
        updateAppStatus(nickname, app_name, "failed", undefined, `エラー: ${err.message}`);
      } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    })();

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: "ローカルデプロイを開始しました。datax_deploy_status で進捗を確認してください。",
          app_name,
          runtime: dockerfileResult.runtime,
          estimated_seconds: 60,
          note: "AWS版より高速です（通常30秒〜2分）",
        }),
      }],
    };
  }
);

// =====================================
// datax_deploy_status — デプロイ状態確認
// =====================================

server.registerTool(
  "datax_deploy_status",
  {
    description: `デプロイの進捗状況を確認します。
status が "active" になるまで30秒ごとにポーリングしてください。`,
    inputSchema: z.object({
      app_name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/).describe("確認するアプリ名"),
    }).shape,
  },
  async (args: any) => {
    const { app_name } = args;
    const nickname = NICKNAME;

    const app = getApp(nickname, app_name);
    if (!app) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            message: `アプリ "${app_name}" が見つかりません。`,
          }),
        }],
      };
    }

    // Dockerコンテナの実際の状態も確認する
    const containerStatus = getContainerStatus(nickname, app_name);
    const logs = getContainerLogs(nickname, app_name);

    // コンテナが実際に動いているのにDBがdeployingの場合はactiveに更新する
    let finalStatus = app.status;
    if (app.status === "deploying" && containerStatus.status === "active") {
      finalStatus = "active";
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          app_name,
          status: finalStatus,
          runtime: app.runtime,
          description: app.description,
          service_url: app.serviceUrl ?? null,
          local_port: app.localPort ?? null,
          container: containerStatus,
          deploy_logs: app.deployLogs ?? null,
          recent_logs: logs.slice(-500),
          ...(finalStatus === "active" && app.serviceUrl
            ? { message: `アプリが起動しました: ${app.serviceUrl}` }
            : {}),
          ...(finalStatus === "deploying"
            ? { next_check: "30秒後に再度 datax_deploy_status を呼び出してください" }
            : {}),
        }),
      }],
    };
  }
);

// =====================================
// datax_write_file — ファイル書き込み
// =====================================

server.registerTool(
  "datax_write_file",
  {
    description: "アプリのソースファイルをローカルに書き込みます。",
    inputSchema: z.object({
      app_name: z.string().regex(APP_NAME_REGEX),
      file_path: z.string().min(1).describe("書き込み先パス（例: app.py）"),
      content: z.string().describe("書き込む内容"),
      mode: z.enum(["overwrite", "append"]).default("overwrite"),
    }).shape,
  },
  async (args: any) => {
    const safePath = sanitizePath(args.file_path);

    // シークレットスキャン（P1セキュリティ対策）
    const scanResult = scanForSecrets(safePath, args.content);
    if (scanResult.detected) {
      const details = scanResult.findings
        .map((f: any) => `  - ${f.label}（${f.line}行目）`)
        .join("\n");
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            reason: "SECRET_DETECTED",
            message:
              `セキュリティポリシー違反のため書き込みを拒否しました。\n` +
              `ファイル "${safePath}" に機密情報が含まれています:\n${details}\n\n` +
              `APIキーやパスワードはコードに直接書かず、環境変数として管理してください。`,
            findings: scanResult.findings,
          }),
        }],
      };
    }

    writeFile(NICKNAME, args.app_name, safePath, args.content, args.mode);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `ファイルを${args.mode === "append" ? "追記" : "書き込み"}しました`,
          file_path: safePath,
          bytes: Buffer.byteLength(args.content, "utf-8"),
        }),
      }],
    };
  }
);

// =====================================
// datax_read_file — ファイル読み込み
// =====================================

server.registerTool(
  "datax_read_file",
  {
    description: "アプリのソースファイルを読み込みます。",
    inputSchema: z.object({
      app_name: z.string().regex(APP_NAME_REGEX),
      file_path: z.string().min(1).describe("読み込むファイルパス"),
    }).shape,
  },
  async (args: any) => {
    const safePath = sanitizePath(args.file_path);
    const content = readFileContent(NICKNAME, args.app_name, safePath);
    if (content === null) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: false, message: `ファイルが見つかりません: ${safePath}` }),
        }],
      };
    }
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ success: true, file_path: safePath, content }),
      }],
    };
  }
);

// =====================================
// datax_list_files — ファイル一覧
// =====================================

server.registerTool(
  "datax_list_files",
  {
    description: "アプリのファイル一覧を表示します。",
    inputSchema: z.object({
      app_name: z.string().regex(APP_NAME_REGEX),
    }).shape,
  },
  async (args: any) => {
    const files = listFiles(NICKNAME, args.app_name);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          app_name: args.app_name,
          file_count: files.length,
          files: files.map((f) => ({
            path: f.path,
            size_bytes: f.size,
            last_modified: f.lastModified.toISOString(),
          })),
        }),
      }],
    };
  }
);

// =====================================
// datax_list — アプリ一覧
// =====================================

server.registerTool(
  "datax_list",
  {
    description: "自分のデプロイ済みアプリ一覧を表示します。",
    inputSchema: z.object({}).shape,
  },
  async (_args: any) => {
    const apps = listApps(NICKNAME);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          total: apps.length,
          apps: apps.map((app) => ({
            app_name: app.appName,
            status: app.status,
            runtime: app.runtime,
            description: app.description,
            service_url: app.serviceUrl ?? null,
            local_port: app.localPort ?? null,
          })),
        }),
      }],
    };
  }
);

// =====================================
// datax_delete — アプリ削除
// =====================================

server.registerTool(
  "datax_delete",
  {
    description: `アプリを削除します（コンテナ停止 + ファイル削除）。
削除は取り消せません。`,
    inputSchema: z.object({
      app_name: z.string().regex(APP_NAME_REGEX).describe("削除するアプリ名"),
    }).shape,
  },
  async (args: any) => {
    const { app_name } = args;
    const nickname = NICKNAME;

    const app = getApp(nickname, app_name);
    if (!app) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            message: `アプリ "${app_name}" が見つかりません。`,
          }),
        }],
      };
    }

    // コンテナを停止・削除する
    stopAndRemoveContainer(nickname, app_name);

    // ソースファイルを削除する
    deleteAppFiles(nickname, app_name);

    // DBを論理削除する
    softDeleteApp(nickname, app_name);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `アプリ "${app_name}" を削除しました。`,
          deleted: ["Dockerコンテナ", "Dockerイメージ", "ソースファイル"],
        }),
      }],
    };
  }
);

// =====================================
// サーバー起動
// =====================================

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[DataX Local] サーバー起動完了 (nickname: ${NICKNAME})`);
  console.error(`[DataX Local] アプリ保存先: ${path.join(os.homedir(), ".datax")}`);
  console.error(`[DataX Local] ポート範囲: 18100〜18199`);
}

main().catch((err) => {
  console.error("[DataX Local] 起動エラー:", err);
  process.exit(1);
});
