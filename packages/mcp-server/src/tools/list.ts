/**
 * datax_list ツール
 * デプロイ済みアプリの一覧を表示する
 */

import { z } from "zod";
import { listApps } from "../db/client.js";

// =====================================
// datax_list ツール入力スキーマ
// =====================================

// リスト取得は引数なし（nicknameはサーバーが自動注入）
export const listSchema = z.object({});

export type ListInput = {
  nickname: string;
};

/**
 * datax_list ツールのハンドラ
 * 自分のアプリ一覧のみ返す（他ユーザーのアプリは表示しない）
 */
export async function handleList(input: ListInput): Promise<string> {
  const apps = await listApps(input.nickname);

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
