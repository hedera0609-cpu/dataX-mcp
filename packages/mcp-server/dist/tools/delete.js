"use strict";
/**
 * datax_delete ツール
 * デプロイ済みアプリを削除する
 * 自分のアプリのみ削除可能（他ユーザーのアプリは削除不可）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSchema = void 0;
exports.handleDelete = handleDelete;
const zod_1 = require("zod");
const client_js_1 = require("../db/client.js");
const ecs_deployer_js_1 = require("../deploy/ecs-deployer.js");
const s3_storage_js_1 = require("../deploy/s3-storage.js");
const constants_js_1 = require("../constants.js");
// =====================================
// datax_delete ツール入力スキーマ
// =====================================
exports.deleteSchema = zod_1.z.object({
    app_name: zod_1.z
        .string()
        .regex(constants_js_1.APP_NAME_REGEX)
        .describe(`削除するアプリ名。

[注意事項]
- 削除は取り消せません
- ECSサービス、ALBターゲットグループ、S3ファイルがすべて削除されます
- DynamoDBのレコードは論理削除（status: deleted）されます`),
});
/**
 * datax_delete ツールのハンドラ
 * nicknameによるオーナーチェックを必ず行い、他ユーザーのアプリは削除不可にする
 */
async function handleDelete(input) {
    const { nickname, app_name } = input;
    // DBからアプリ情報を取得する
    const app = await (0, client_js_1.getApp)(nickname, app_name);
    // アプリが存在しない場合はエラーを返す
    if (!app) {
        return JSON.stringify({
            success: false,
            message: `アプリ "${app_name}" が見つかりません。`,
            hint: "datax_list でアプリ一覧を確認してください。",
        });
    }
    // 既に削除済みの場合はエラーを返す
    if (app.status === "deleted") {
        return JSON.stringify({
            success: false,
            message: `アプリ "${app_name}" は既に削除済みです。`,
        });
    }
    // ECSサービス・ALBリソースを削除する
    await (0, ecs_deployer_js_1.deleteApp)(nickname, app_name, app.targetGroupArn ?? "", undefined // ruleArnはDBに保存していないため、ECSデプロイ時に追加可能
    );
    // S3上のファイルを削除する
    await (0, s3_storage_js_1.deleteAppFiles)(nickname, app_name);
    // DBを論理削除する
    await (0, client_js_1.softDeleteApp)(nickname, app_name);
    return JSON.stringify({
        success: true,
        message: `アプリ "${app_name}" を削除しました。`,
        deleted_resources: [
            "ECSサービス",
            "ALBターゲットグループ",
            "S3ファイル",
            "タスク定義",
        ],
    });
}
//# sourceMappingURL=delete.js.map