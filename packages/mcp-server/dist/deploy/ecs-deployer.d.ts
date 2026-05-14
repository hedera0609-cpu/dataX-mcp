/**
 * ECS デプロイモジュール
 * ECRへのイメージプッシュとECSサービスの作成・管理を担当する
 */
/**
 * ECRリポジトリを取得または作成する
 * リポジトリが存在しない場合は新規作成する
 */
export declare function ensureEcrRepository(nickname: string, appName: string): Promise<string>;
/**
 * ECR認証トークンを取得してDockerにログインする
 */
export declare function loginToEcr(): Promise<void>;
/**
 * DockerイメージをビルドしてECRにプッシュする
 * S3から取得済みのファイルが一時ディレクトリに展開済みであることを前提とする
 */
export declare function buildAndPushImage(nickname: string, appName: string, buildDir: string, repositoryUri: string): Promise<string>;
/**
 * ALBターゲットグループを作成する
 * アプリごとに独立したターゲットグループを作成する
 */
export declare function createTargetGroup(nickname: string, appName: string): Promise<string>;
/**
 * ALBリスナールールを作成する
 * ホストヘッダーパターンでルーティングする（Phase 2で使用）
 * Phase 1ではパスベースルーティングを使用する
 */
export declare function createAlbRule(targetGroupArn: string, nickname: string, appName: string, domain: string): Promise<string>;
/**
 * ECSタスク定義を登録する
 */
export declare function registerTaskDefinition(nickname: string, appName: string, imageUri: string): Promise<string>;
/**
 * ECSサービスを作成または更新する
 */
export declare function deployEcsService(nickname: string, appName: string, taskDefinitionArn: string, targetGroupArn: string): Promise<string>;
/**
 * ECSサービスのデプロイ状態を確認する
 */
export declare function getServiceStatus(nickname: string, appName: string): Promise<{
    status: "deploying" | "active" | "failed" | "not_found";
    runningCount: number;
    pendingCount: number;
    desiredCount: number;
    events: string[];
}>;
/**
 * ECSサービスとタスク定義、ターゲットグループを削除する
 */
export declare function deleteApp(nickname: string, appName: string, targetGroupArn: string, ruleArn?: string): Promise<void>;
//# sourceMappingURL=ecs-deployer.d.ts.map