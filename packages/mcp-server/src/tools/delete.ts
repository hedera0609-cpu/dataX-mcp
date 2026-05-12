/**
 * datax_delete ツール
 * デプロイ済みアプリを削除する
 * 自分のアプリのみ削除可能（他ユーザーのアプリは削除不可）
 */

import { z } from "zod";
import { getApp, softDeleteApp } from "../db/client.js";
import { deleteApp } from "../deploy/ecs-deployer.js";
import { deleteAppFiles } from "../deploy/s3-storage.js";

// =====================================
// datax_delete ツール入力スキーマ
// =====================================

export const deleteSchema = z.object({
  app_name: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/)
    .describe(
      `削除するアプリ名。

[注意事項]
- 削除は取り消せません
- ECSサービス、ALBターゲットグループ、S3ファイルがすべて削除されます
- DynamoDBのレコードは論理削除（status: deleted）されます`
    ),
});

export type DeleteInput = z.infer<typeof deleteSchema> & {
  nickname: string;
};

/**
 * datax_delete ツールのハンドラ
 * nicknameによるオーナーチェックを必ず行い、他ユーザーのアプリは削除不可にする
 */
export async function handleDelete(input: DeleteInput): Promise<string> {
  const { nickname, app_name } = input;

  // DBからアプリ情報を取得する
  const app = await getApp(nickname, app_name);

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

  // オーナー検証（PK がUSER#{nickname}と一致することでDB側で保証されているが、追加チェック）
  if (app.nickname !== nickname) {
    return JSON.stringify({
      success: false,
      message: "他のユーザーのアプリは削除できません。",
    });
  }

  // ECSサービス・ALBリソースを削除する
  await deleteApp(
    nickname,
    app_name,
    app.targetGroupArn ?? "",
    undefined // ruleArnはDBに保存していないため、ECSデプロイ時に追加可能
  );

  // S3上のファイルを削除する
  await deleteAppFiles(nickname, app_name);

  // DBを論理削除する
  await softDeleteApp(nickname, app_name);

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
