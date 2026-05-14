"use strict";
/**
 * datax_list ツール
 * デプロイ済みアプリの一覧を表示する
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSchema = void 0;
exports.handleList = handleList;
const zod_1 = require("zod");
const client_js_1 = require("../db/client.js");
// =====================================
// datax_list ツール入力スキーマ
// =====================================
// リスト取得は引数なし（nicknameはサーバーが自動注入）
exports.listSchema = zod_1.z.object({});
/**
 * datax_list ツールのハンドラ
 * 自分のアプリ一覧のみ返す（他ユーザーのアプリは表示しない）
 */
async function handleList(input) {
    const apps = await (0, client_js_1.listApps)(input.nickname);
    if (apps.length === 0) {
        return JSON.stringify({
            success: true,
            message: "デプロイ済みのアプリはありません。datax_publish でデプロイしてください。",
            apps: [],
            total: 0,
        });
    }
    return JSON.stringify({
        success: true,
        total: apps.length,
        apps: apps.map((app) => ({
            app_name: app.appName,
            status: app.status,
            runtime: app.runtime,
            description: app.description,
            service_url: app.serviceUrl ?? null,
            created_at: app.createdAt,
            updated_at: app.updatedAt,
        })),
    });
}
//# sourceMappingURL=list.js.map