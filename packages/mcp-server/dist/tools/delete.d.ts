/**
 * datax_delete ツール
 * デプロイ済みアプリを削除する
 * 自分のアプリのみ削除可能（他ユーザーのアプリは削除不可）
 */
import { z } from "zod";
export declare const deleteSchema: z.ZodObject<{
    app_name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    app_name: string;
}, {
    app_name: string;
}>;
export type DeleteInput = z.infer<typeof deleteSchema> & {
    nickname: string;
};
/**
 * datax_delete ツールのハンドラ
 * nicknameによるオーナーチェックを必ず行い、他ユーザーのアプリは削除不可にする
 */
export declare function handleDelete(input: DeleteInput): Promise<string>;
//# sourceMappingURL=delete.d.ts.map