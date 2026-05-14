/**
 * datax_deploy_status ツール
 * デプロイの進捗状況を確認する（ポーリング方式）
 */

import { z } from "zod";
import { getApp } from "../db/client.js";
import { getServiceStatus } from "../deploy/ecs-deployer.js";
import { APP_NAME_REGEX } from "../constants.js";

// =====================================
// datax_deploy_status ツール入力スキーマ
// =====================================

export const deployStatusSchema = z.object({
  app_name: z
    .string()
    .regex(APP_NAME_REGEX)
    .describe(
      `デプロイ状況を確認するアプリ名。

[使い方]
- datax_publish 後に呼び出して、デプロイ完了を確認する
- status が "active" になるまで 30〜60 秒ごとにポーリングする
- 通常 3〜5 分で完了する
- status が "failed" の場合は deploy_logs を確認してエラー内容を把握する

[ステータス一覧]
- deploying: デプロイ中（正常）
- active: 稼働中（完了）
- failed: デプロイ失敗（deploy_logs を確認すること）
- not_found: アプリが見つからない`
    ),
});

export type DeployStatusInput = z.infer<typeof deployStatusSchema> & {
  nickname: string;
};

/**
 * datax_deploy_status ツールのハンドラ
 * DBとECSの両方からステータスを取得して統合して返す
 */
export async function handleDeployStatus(
  input: DeployStatusInput
): Promise<string> {
  const { nickname, app_name } = input;

  // DBからアプリ情報を取得する
  const app = await getApp(nickname, app_name);
  if (!app) {
    return JSON.stringify({
      success: false,
      message: `アプリ "${app_name}" が見つかりません。datax_publish で先にデプロイしてください。`,
    });
  }

  if (app.status === "deleted") {
    return JSON.stringify({
      success: false,
      message: `アプリ "${app_name}" は削除済みです。`,
    });
  }

  // ECSサービスの実際の状態も確認する（よりリアルタイムな情報）
  const ecsStatus = await getServiceStatus(nickname, app_name);

  // ECSの状態でDBを上書き判定する
  let finalStatus = app.status;
  if (app.status === "deploying" && ecsStatus.status === "active") {
    finalStatus = "active";
  } else if (app.status === "deploying" && ecsStatus.status === "failed") {
    finalStatus = "failed";
  }

  // statusがactiveかつURLがある場合はアクセス案内を追加する
  const accessInfo =
    finalStatus === "active" && app.serviceUrl
      ? {
          url: app.serviceUrl,
          message: "アプリが正常に起動しました。上記URLでアクセスできます。",
        }
      : null;

  return JSON.stringify({
    success: true,
    app_name,
    status: finalStatus,
    runtime: app.runtime,
    description: app.description,
    service_url: app.serviceUrl ?? null,
    ecs: {
      running_count: ecsStatus.runningCount,
      pending_count: ecsStatus.pendingCount,
      desired_count: ecsStatus.desiredCount,
      recent_events: ecsStatus.events,
    },
    deploy_logs: app.deployLogs ?? null,
    created_at: app.createdAt,
    updated_at: app.updatedAt,
    ...(accessInfo ?? {}),
    // activeでない場合は再チェックの案内を追加する
    ...(finalStatus === "deploying"
      ? {
          next_check: "30〜60秒後に再度 datax_deploy_status を呼び出してください",
        }
      : {}),
  });
}
