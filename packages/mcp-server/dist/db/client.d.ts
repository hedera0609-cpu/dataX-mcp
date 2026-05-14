/**
 * DynamoDB クライアントモジュール
 * アプリの状態管理を担当する
 */
export type AppStatus = "deploying" | "active" | "failed" | "deleted";
export type Runtime = "python" | "java" | "nodejs" | "static" | "custom";
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
export declare function putApp(record: AppRecord): Promise<void>;
/**
 * アプリレコードをDynamoDBから取得する
 */
export declare function getApp(nickname: string, appName: string): Promise<AppRecord | null>;
/**
 * ユーザーの全アプリ一覧を取得する（削除済みを除外）
 */
export declare function listApps(nickname: string): Promise<AppRecord[]>;
/**
 * アプリのステータスとログを更新する
 */
export declare function updateAppStatus(nickname: string, appName: string, status: AppStatus, serviceUrl?: string, deployLogs?: string, extra?: Partial<AppRecord>): Promise<void>;
/**
 * アプリレコードを論理削除する（statusをdeletedに変更）
 */
export declare function softDeleteApp(nickname: string, appName: string): Promise<void>;
//# sourceMappingURL=client.d.ts.map