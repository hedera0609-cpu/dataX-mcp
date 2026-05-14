/**
 * ローカル用デプロイモジュール
 * AWSのECS/ECR/ALBの代わりにローカルのDockerでアプリを実行する
 * アプリはポート 18100〜18199 でlocalhost上に公開される
 */
/**
 * 次に使用可能なポートを返す
 * 使用中のポートを避けて割り当てる
 */
export declare function getNextAvailablePort(): number;
/**
 * ソースディレクトリからDockerイメージをビルドしてコンテナを起動する
 * @returns 割り当てたポート番号
 */
export declare function buildAndRunContainer(nickname: string, appName: string, sourceDir: string): Promise<number>;
/**
 * コンテナのステータスを取得する
 */
export declare function getContainerStatus(nickname: string, appName: string): {
    status: "active" | "stopped" | "not_found";
    containerId?: string;
    uptime?: string;
};
/**
 * コンテナを停止・削除する
 */
export declare function stopAndRemoveContainer(nickname: string, appName: string): void;
/**
 * コンテナのログを取得する（直近50行）
 */
export declare function getContainerLogs(nickname: string, appName: string): string;
//# sourceMappingURL=deployer.d.ts.map