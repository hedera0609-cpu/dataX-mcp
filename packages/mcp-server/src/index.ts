/**
 * DataX MCP サーバー エントリーポイント
 * 環境変数 DATAX_NICKNAME から自動的にnicknameを注入する
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { publishSchema, handlePublish } from "./tools/publish.js";
import { deployStatusSchema, handleDeployStatus } from "./tools/status.js";
import {
  writeFileSchema,
  handleWriteFile,
  readFileSchema,
  handleReadFile,
  listFilesSchema,
  handleListFiles,
} from "./tools/files.js";
import { listSchema, handleList } from "./tools/list.js";
import { deleteSchema, handleDelete } from "./tools/delete.js";

// =====================================
// 起動時のバリデーション
// =====================================

const NICKNAME = process.env.DATAX_NICKNAME;
if (!NICKNAME) {
  console.error(
    "[DataX MCP] 環境変数 DATAX_NICKNAME が設定されていません。" +
      "MCP設定ファイルに DATAX_NICKNAME=あなたのニックネーム を追加してください。"
  );
  process.exit(1);
}

// nicknameのバリデーション（英小文字・数字・ハイフンのみ）
if (!/^[a-z0-9][a-z0-9-]{0,20}[a-z0-9]$/.test(NICKNAME)) {
  console.error(
    `[DataX MCP] DATAX_NICKNAME "${NICKNAME}" の形式が正しくありません。` +
      "英小文字・数字・ハイフンのみ使用可能です（先頭末尾は英数字、2〜22文字）。"
  );
  process.exit(1);
}

// =====================================
// MCP サーバーの初期化
// =====================================

const server = new McpServer({
  name: "datax-mcp",
  version: "1.0.0",
});

// =====================================
// ツール登録
// nicknameはすべてのツールでサーバーが自動注入する
// → AIや利用者がnicknameを操作できない構造
// =====================================

server.registerTool(
  "datax_publish",
  {
    description: "アプリをECS Fargateにデプロイする",
    inputSchema: publishSchema.shape,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await handlePublish({ ...args, nickname: NICKNAME });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.registerTool(
  "datax_deploy_status",
  {
    description: "デプロイ状況を確認する（ポーリング方式）",
    inputSchema: deployStatusSchema.shape,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await handleDeployStatus({ ...args, nickname: NICKNAME });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.registerTool(
  "datax_write_file",
  {
    description: "S3にファイルを書き込む",
    inputSchema: writeFileSchema.shape,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await handleWriteFile({ ...args, nickname: NICKNAME });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.registerTool(
  "datax_read_file",
  {
    description: "S3からファイルを読み込む",
    inputSchema: readFileSchema.shape,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await handleReadFile({ ...args, nickname: NICKNAME });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.registerTool(
  "datax_list_files",
  {
    description: "S3上のファイル一覧を取得する",
    inputSchema: listFilesSchema.shape,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await handleListFiles({ ...args, nickname: NICKNAME });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.registerTool(
  "datax_list",
  {
    description: "自分のデプロイ済みアプリ一覧を取得する",
    inputSchema: listSchema.shape,
  },
  async (_args: any) => {
    const result = await handleList({ nickname: NICKNAME });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.registerTool(
  "datax_delete",
  {
    description: "アプリを削除する（自分のアプリのみ）",
    inputSchema: deleteSchema.shape,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await handleDelete({ ...args, nickname: NICKNAME });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// =====================================
// サーバー起動
// =====================================

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[DataX MCP] サーバー起動完了 (nickname: ${NICKNAME})`);
}

main().catch((err) => {
  console.error("[DataX MCP] 起動エラー:", err);
  process.exit(1);
});
