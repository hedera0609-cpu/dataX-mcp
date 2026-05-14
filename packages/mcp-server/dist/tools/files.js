"use strict";
/**
 * ファイル操作ツール
 * sandbox_write_file / sandbox_read_file / sandbox_list_files の実装
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFilesSchema = exports.readFileSchema = exports.writeFileSchema = void 0;
exports.handleWriteFile = handleWriteFile;
exports.handleReadFile = handleReadFile;
exports.handleListFiles = handleListFiles;
const zod_1 = require("zod");
const s3_storage_js_1 = require("../deploy/s3-storage.js");
const constants_js_1 = require("../constants.js");
// =====================================
// datax_write_file ツール定義
// =====================================
exports.writeFileSchema = zod_1.z.object({
    app_name: zod_1.z
        .string()
        .regex(constants_js_1.APP_NAME_REGEX, "app_nameは英小文字・数字・ハイフンのみ使用可能です（先頭末尾は英数字）"),
    file_path: zod_1.z
        .string()
        .min(1)
        .describe("書き込み先ファイルパス（例: app.py, src/main.py）"),
    content: zod_1.z.string().describe("書き込む内容"),
    mode: zod_1.z
        .enum(["overwrite", "append"])
        .default("overwrite")
        .describe("overwrite: 上書き（デフォルト）/ append: 追記"),
});
/**
 * datax_write_file ツールのハンドラ
 */
async function handleWriteFile(input) {
    const safePath = (0, constants_js_1.sanitizePath)(input.file_path);
    await (0, s3_storage_js_1.writeFile)(input.nickname, input.app_name, safePath, input.content, input.mode);
    return JSON.stringify({
        success: true,
        message: `ファイルを${input.mode === "append" ? "追記" : "書き込み"}しました`,
        app_name: input.app_name,
        file_path: safePath,
        bytes: Buffer.byteLength(input.content, "utf-8"),
    });
}
// =====================================
// datax_read_file ツール定義
// =====================================
exports.readFileSchema = zod_1.z.object({
    app_name: zod_1.z.string().regex(constants_js_1.APP_NAME_REGEX).describe("対象アプリ名"),
    file_path: zod_1.z.string().min(1).describe("読み込むファイルパス"),
});
/**
 * datax_read_file ツールのハンドラ
 */
async function handleReadFile(input) {
    const safePath = (0, constants_js_1.sanitizePath)(input.file_path);
    const content = await (0, s3_storage_js_1.readFileContent)(input.nickname, input.app_name, safePath);
    if (content === null) {
        return JSON.stringify({
            success: false,
            message: `ファイルが見つかりません: ${safePath}`,
        });
    }
    return JSON.stringify({
        success: true,
        app_name: input.app_name,
        file_path: safePath,
        content,
        bytes: Buffer.byteLength(content, "utf-8"),
    });
}
// =====================================
// datax_list_files ツール定義
// =====================================
exports.listFilesSchema = zod_1.z.object({
    app_name: zod_1.z.string().regex(constants_js_1.APP_NAME_REGEX).describe("対象アプリ名"),
});
/**
 * datax_list_files ツールのハンドラ
 */
async function handleListFiles(input) {
    const files = await (0, s3_storage_js_1.listFiles)(input.nickname, input.app_name);
    return JSON.stringify({
        success: true,
        app_name: input.app_name,
        file_count: files.length,
        files: files.map((f) => ({
            path: f.path,
            size_bytes: f.size,
            last_modified: f.lastModified.toISOString(),
        })),
    });
}
//# sourceMappingURL=files.js.map