/**
 * datax_deploy_status ツール
 * デプロイの進捗状況を確認する（ポーリング方式）
 */
import { z } from "zod";
export declare const deployStatusSchema: z.ZodObject<{
    app_name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    app_name: string;
}, {
    app_name: string;
}>;
export type DeployStatusInput = z.infer<typeof deployStatusSchema> & {
    nickname: string;
};
/**
 * datax_deploy_status ツールのハンドラ
 * DBとECSの両方からステータスを取得して統合して返す
 */
export declare function handleDeployStatus(input: DeployStatusInput): Promise<string>;
//# sourceMappingURL=status.d.ts.map