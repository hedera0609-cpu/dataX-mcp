/**
 * ファイル操作ツール
 * sandbox_write_file / sandbox_read_file / sandbox_list_files の実装
 */

import { z } from "zod";
import {
  writeFile,
  readFileContent,
  listFiles,
} from "../deploy/s3-storage.js";
import { APP_NAME_REGEX, sanitizePath, scanForSecrets } from "../constants.js";

// =====================================
// datax_write_file ツール定義
// =====================================

export const writeFileSchema = z.object({
  app_name: z
    .string()
    .regex(APP_NAME_REGEX, "app_nameは英小文字・数字・ハイフンのみ使用可能です（先頭末尾は英数字）"),
  file_path: z
    .string()
    .min(1)
    .describe("書き込み先ファイルパス（例: app.py, src/main.py）"),
  content: z.string().describe("書き込む内容"),
  mode: z
    .enum(["overwrite", "append"])
    .default("overwrite")
    .describe("overwrite: 上書き（デフォルト）/ append: 追記"),
});

export type WriteFileInput = z.infer<typeof writeFileSchema> & {
  nickname: string;
};

/**
 * datax_write_file ツールのハンドラ
 * 書き込み前にシークレットスキャンを実施し、機密情報が含まれる場合は拒否する
 */
export async function handleWriteFile(input: WriteFileInput): Promise<string> {
  const safePath = sanitizePath(input.file_path);

  // シークレットスキャン（P1セキュリティ対策）
  const scanResult = scanForSecrets(safePath, input.content);
  if (scanResult.detected) {
    const details = scanResult.findings
      .map((f) => `  - ${f.label}（${f.line}行目）`)
      .join("\n");
    return JSON.stringify({
      success: false,
      reason: "SECRET_DETECTED",
      message:
        `セキュリティポリシー違反のため書き込みを拒否しました。\n` +
        `ファイル "${safePath}" に機密情報が含まれています:\n${details}\n\n` +
        `APIキーやパスワードはコードに直接書かず、環境変数として管理してください。`,
      findings: scanResult.findings,
    });
  }

  await writeFile(
    input.nickname,
    input.app_name,
    safePath,
    input.content,
    input.mode
  );

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

export const readFileSchema = z.object({
  app_name: z.string().regex(APP_NAME_REGEX).describe("対象アプリ名"),
  file_path: z.string().min(1).describe("読み込むファイルパス"),
});

export type ReadFileInput = z.infer<typeof readFileSchema> & {
  nickname: string;
};

/**
 * datax_read_file ツールのハンドラ
 */
export async function handleReadFile(input: ReadFileInput): Promise<string> {
  const safePath = sanitizePath(input.file_path);

  const content = await readFileContent(
    input.nickname,
    input.app_name,
    safePath
  );

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

export const listFilesSchema = z.object({
  app_name: z.string().regex(APP_NAME_REGEX).describe("対象アプリ名"),
});

export type ListFilesInput = z.infer<typeof listFilesSchema> & {
  nickname: string;
};

/**
 * datax_list_files ツールのハンドラ
 */
export async function handleListFiles(input: ListFilesInput): Promise<string> {
  const files = await listFiles(input.nickname, input.app_name);

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
