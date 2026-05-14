"use strict";
/**
 * DynamoDB クライアントモジュール
 * アプリの状態管理を担当する
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.putApp = putApp;
exports.getApp = getApp;
exports.listApps = listApps;
exports.updateAppStatus = updateAppStatus;
exports.softDeleteApp = softDeleteApp;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
// DynamoDB テーブル名（環境変数から取得）
const TABLE_NAME = process.env.DYNAMODB_TABLE ?? "datax-apps";
// DynamoDB クライアントの初期化
const ddbClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION ?? "ap-northeast-2",
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: {
        removeUndefinedValues: true,
    },
});
/**
 * アプリレコードをDynamoDBに保存する
 */
async function putApp(record) {
    await docClient.send(new lib_dynamodb_1.PutCommand({
        TableName: TABLE_NAME,
        Item: {
            PK: `USER#${record.nickname}`,
            SK: `APP#${record.appName}`,
            ...record,
        },
    }));
}
/**
 * アプリレコードをDynamoDBから取得する
 */
async function getApp(nickname, appName) {
    const result = await docClient.send(new lib_dynamodb_1.GetCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: `USER#${nickname}`,
            SK: `APP#${appName}`,
        },
    }));
    if (!result.Item)
        return null;
    return result.Item;
}
/**
 * ユーザーの全アプリ一覧を取得する（削除済みを除外）
 */
async function listApps(nickname) {
    const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
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
    }));
    return (result.Items ?? []);
}
/**
 * アプリのステータスとログを更新する
 */
async function updateAppStatus(nickname, appName, status, serviceUrl, deployLogs, extra) {
    // 更新する属性を動的に構築
    let updateExpression = "SET #status = :status, updatedAt = :updatedAt";
    const expressionAttributeNames = {
        "#status": "status",
    };
    const expressionAttributeValues = {
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
    await docClient.send(new lib_dynamodb_1.UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: `USER#${nickname}`,
            SK: `APP#${appName}`,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
    }));
}
/**
 * アプリレコードを論理削除する（statusをdeletedに変更）
 */
async function softDeleteApp(nickname, appName) {
    await updateAppStatus(nickname, appName, "deleted");
}
//# sourceMappingURL=client.js.map