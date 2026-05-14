/**
 * datax_publish ツール
 * アプリをECS Fargateにデプロイする（非同期）
 */
import { z } from "zod";
export declare const publishSchema: z.ZodObject<{
    app_name: z.ZodString;
    description: z.ZodString;
}, "strip", z.ZodTypeAny, {
    description: string;
    app_name: string;
}, {
    description: string;
    app_name: string;
}>;
export type PublishInput = z.infer<typeof publishSchema> & {
    nickname: string;
};
/**
 * datax_publish ツールのハンドラ
 * S3からファイルを取得してDockerイメージをビルドし、ECSにデプロイする
 */
export declare function handlePublish(input: PublishInput): Promise<string>;
//# sourceMappingURL=publish.d.ts.map