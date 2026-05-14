"use strict";
/**
 * DataX MCP サーバー エントリーポイント
 * 環境変数 DATAX_NICKNAME から自動的にnicknameを注入する
 */
Object.defineProperty(exports, "__esModule", { value: true });
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const publish_js_1 = require("./tools/publish.js");
const status_js_1 = require("./tools/status.js");
const files_js_1 = require("./tools/files.js");
const list_js_1 = require("./tools/list.js");
const delete_js_1 = require("./tools/delete.js");
// =====================================
// 起動時のバリデーション
// =====================================
const NICKNAME = process.env.DATAX_NICKNAME;
if (!NICKNAME) {
    console.error("[DataX MCP] 環境変数 DATAX_NICKNAME が設定されていません。" +
        "MCP設定ファイルに DATAX_NICKNAME=あなたのニックネーム を追加してください。");
    process.exit(1);
}
// nicknameのバリデーション（英小文字・数字・ハイフンのみ）
if (!/^[a-z0-9][a-z0-9-]{0,20}[a-z0-9]$/.test(NICKNAME)) {
    console.error(`[DataX MCP] DATAX_NICKNAME "${NICKNAME}" の形式が正しくありません。` +
        "英小文字・数字・ハイフンのみ使用可能です（先頭末尾は英数字、2〜22文字）。");
    process.exit(1);
}
// =====================================
// MCP サーバーの初期化
// =====================================
const server = new mcp_js_1.McpServer({
    name: "datax-mcp",
    version: "1.0.0",
});
// =====================================
// ツール登録
// nicknameはすべてのツールでサーバーが自動注入する
// → AIや利用者がnicknameを操作できない構造
// =====================================
/** nicknameを自動注入してツールを登録するヘルパー */
function reg(name, description, inputSchema, handler) {
    server.registerTool(name, { description, inputSchema }, async (args) => ({
        content: [{ type: "text", text: await handler({ ...args, nickname: NICKNAME }) }],
    }));
}
reg("datax_publish", "アプリをECS Fargateにデプロイする", publish_js_1.publishSchema.shape, publish_js_1.handlePublish);
reg("datax_deploy_status", "デプロイ状況を確認する（ポーリング方式）", status_js_1.deployStatusSchema.shape, status_js_1.handleDeployStatus);
reg("datax_write_file", "S3にファイルを書き込む", files_js_1.writeFileSchema.shape, files_js_1.handleWriteFile);
reg("datax_read_file", "S3からファイルを読み込む", files_js_1.readFileSchema.shape, files_js_1.handleReadFile);
reg("datax_list_files", "S3上のファイル一覧を取得する", files_js_1.listFilesSchema.shape, files_js_1.handleListFiles);
reg("datax_delete", "アプリを削除する（自分のアプリのみ）", delete_js_1.deleteSchema.shape, delete_js_1.handleDelete);
// datax_list は引数なし（nicknameのみ注入）
server.registerTool("datax_list", { description: "自分のデプロイ済みアプリ一覧を取得する", inputSchema: list_js_1.listSchema.shape }, async () => ({ content: [{ type: "text", text: await (0, list_js_1.handleList)({ nickname: NICKNAME }) }] }));
// =====================================
// サーバー起動
// =====================================
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error(`[DataX MCP] サーバー起動完了 (nickname: ${NICKNAME})`);
}
main().catch((err) => {
    console.error("[DataX MCP] 起動エラー:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map