/**
 * ファイル操作ツール
 * sandbox_write_file / sandbox_read_file / sandbox_list_files の実装
 */
import { z } from "zod";
export declare const writeFileSchema: z.ZodObject<{
    app_name: z.ZodString;
    file_path: z.ZodString;
    content: z.ZodString;
    mode: z.ZodDefault<z.ZodEnum<["overwrite", "append"]>>;
}, "strip", z.ZodTypeAny, {
    app_name: string;
    file_path: string;
    content: string;
    mode: "overwrite" | "append";
}, {
    app_name: string;
    file_path: string;
    content: string;
    mode?: "overwrite" | "append" | undefined;
}>;
export type WriteFileInput = z.infer<typeof writeFileSchema> & {
    nickname: string;
};
/**
 * datax_write_file ツールのハンドラ
 */
export declare function handleWriteFile(input: WriteFileInput): Promise<string>;
export declare const readFileSchema: z.ZodObject<{
    app_name: z.ZodString;
    file_path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    app_name: string;
    file_path: string;
}, {
    app_name: string;
    file_path: string;
}>;
export type ReadFileInput = z.infer<typeof readFileSchema> & {
    nickname: string;
};
/**
 * datax_read_file ツールのハンドラ
 */
export declare function handleReadFile(input: ReadFileInput): Promise<string>;
export declare const listFilesSchema: z.ZodObject<{
    app_name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    app_name: string;
}, {
    app_name: string;
}>;
export type ListFilesInput = z.infer<typeof listFilesSchema> & {
    nickname: string;
};
/**
 * datax_list_files ツールのハンドラ
 */
export declare function handleListFiles(input: ListFilesInput): Promise<string>;
//# sourceMappingURL=files.d.ts.map