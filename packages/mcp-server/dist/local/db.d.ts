/**
 * ローカル用データベース
 * AWSのDynamoDBの代わりに ~/.datax/apps.json にアプリ状態を保存する
 */
export type AppStatus = "deploying" | "active" | "failed" | "deleted";
export type Runtime = "python" | "java" | "nodejs" | "static" | "custom";
export interface AppRecord {
    nickname: string;
    appName: string;
    status: AppStatus;
    serviceUrl?: string;
    localPort?: number;
    createdAt: string;
    updatedAt: string;
    description: string;
    runtime: Runtime;
    deployLogs?: string;
}
export declare function getApp(nickname: string, appName: string): AppRecord | null;
export declare function putApp(record: AppRecord): void;
export declare function listApps(nickname: string): AppRecord[];
export declare function updateAppStatus(nickname: string, appName: string, status: AppStatus, serviceUrl?: string, deployLogs?: string, extra?: Partial<AppRecord>): void;
export declare function softDeleteApp(nickname: string, appName: string): void;
/** 使用中のポート一覧を返す（ポート割り当て時の重複チェック用） */
export declare function getUsedPorts(): number[];
//# sourceMappingURL=db.d.ts.map