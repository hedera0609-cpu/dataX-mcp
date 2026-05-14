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

/** nicknameを自動注入してツールを登録するヘルパー */
function reg(
  name: string,
  description: string,
  inputSchema: Record<string, any>,
  handler: (args: any) => Promise<string>
) {
  server.registerTool(name, { description, inputSchema }, async (args: any) => ({
    content: [{ type: "text" as const, text: await handler({ ...args, nickname: NICKNAME }) }],
  }));
}

reg("datax_publish",      "アプリをECS Fargateにデプロイする",        publishSchema.shape,      handlePublish);
reg("datax_deploy_status","デプロイ状況を確認する（ポーリング方式）",  deployStatusSchema.shape, handleDeployStatus);
reg("datax_write_file",   "S3にファイルを書き込む",                    writeFileSchema.shape,    handleWriteFile);
reg("datax_read_file",    "S3からファイルを読み込む",                   readFileSchema.shape,     handleReadFile);
reg("datax_list_files",   "S3上のファイル一覧を取得する",              listFilesSchema.shape,    handleListFiles);
reg("datax_delete",       "アプリを削除する（自分のアプリのみ）",      deleteSchema.shape,       handleDelete);

// datax_list は引数なし（nicknameのみ注入）
server.registerTool(
  "datax_list",
  { description: "自分のデプロイ済みアプリ一覧を取得する", inputSchema: listSchema.shape },
  async () => ({ content: [{ type: "text" as const, text: await handleList({ nickname: NICKNAME }) }] })
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
