/**
 * datax_list ツール
 * デプロイ済みアプリの一覧を表示する
 */
import { z } from "zod";
export declare const listSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export type ListInput = {
    nickname: string;
};
/**
 * datax_list ツールのハンドラ
 * 自分のアプリ一覧のみ返す（他ユーザーのアプリは表示しない）
 */
export declare function handleList(input: ListInput): Promise<string>;
//# sourceMappingURL=list.d.ts.map