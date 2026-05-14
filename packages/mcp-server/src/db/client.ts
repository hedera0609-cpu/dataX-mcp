/**
 * DynamoDB クライアントモジュール
 * アプリの状態管理を担当する
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

// DynamoDB テーブル名（環境変数から取得）
const TABLE_NAME = process.env.DYNAMODB_TABLE ?? "datax-apps";

// DynamoDB クライアントの初期化
const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "ap-northeast-2",
});

const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// アプリのステータス型定義
export type AppStatus = "deploying" | "active" | "failed" | "deleted";

// ランタイム型定義
export type Runtime = "python" | "java" | "nodejs" | "static" | "custom";

// アプリレコード型定義
export interface AppRecord {
  nickname: string;
  appName: string;
  status: AppStatus;
  serviceUrl?: string;
  createdAt: string;
  updatedAt: string;
  description: string;
  runtime: Runtime;
  deployLogs?: string;
  ecsServiceArn?: string;
  targetGroupArn?: string;
  ecrRepositoryUri?: string;
}

/**
 * アプリレコードをDynamoDBに保存する
 */
export async function putApp(record: AppRecord): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${record.nickname}`,
        SK: `APP#${record.appName}`,
        ...record,
      },
    })
  );
}

/**
 * アプリレコードをDynamoDBから取得する
 */
export async function getApp(
  nickname: string,
  appName: string
): Promise<AppRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${nickname}`,
        SK: `APP#${appName}`,
      },
    })
  );

  if (!result.Item) return null;
  return result.Item as AppRecord;
}

/**
 * ユーザーの全アプリ一覧を取得する（削除済みを除外）
 */
export async function listApps(nickname: string): Promise<AppRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk_prefix)",
      FilterExpression: "#status <> :deleted",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":pk": `USER#${nickname}`,
        ":sk_prefix": "APP#",
        ":deleted": "deleted",
      },
    })
  );

  return (result.Items ?? []) as AppRecord[];
}

/**
 * アプリのステータスとログを更新する
 */
export async function updateAppStatus(
  nickname: string,
  appName: string,
  status: AppStatus,
  serviceUrl?: string,
  deployLogs?: string,
  extra?: Partial<AppRecord>
): Promise<void> {
  // 更新する属性を動的に構築
  let updateExpression =
    "SET #status = :status, updatedAt = :updatedAt";
  const expressionAttributeNames: Record<string, string> = {
    "#status": "status",
  };
  const expressionAttributeValues: Record<string, unknown> = {
    ":status": status,
    ":updatedAt": new Date().toISOString(),
  };

  if (serviceUrl !== undefined) {
    updateExpression += ", serviceUrl = :serviceUrl";
    expressionAttributeValues[":serviceUrl"] = serviceUrl;
  }

  if (deployLogs !== undefined) {
    // ログは最新1000文字のみ保持
    updateExpression += ", deployLogs = :deployLogs";
    expressionAttributeValues[":deployLogs"] = deployLogs.slice(-1000);
  }

  // 追加フィールドの更新
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) {
        updateExpression += `, #${key} = :${key}`;
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    }
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${nickname}`,
        SK: `APP#${appName}`,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );
}

/**
 * アプリレコードを論理削除する（statusをdeletedに変更）
 */
export async function softDeleteApp(
  nickname: string,
  appName: string
): Promise<void> {
  await updateAppStatus(nickname, appName, "deleted");
}
