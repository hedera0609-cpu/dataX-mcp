/**
 * S3 ストレージモジュール
 * アプリのソースファイルをS3で管理する
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

// S3 バケット名（環境変数から取得）
const BUCKET_NAME = process.env.S3_BUCKET ?? "datax-app-sources";

// S3 クライアントの初期化
const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? "ap-northeast-2",
});

/**
 * S3 キーのプレフィックスを生成する
 * パス: apps/{nickname}/{appName}/
 */
function getAppPrefix(nickname: string, appName: string): string {
  return `apps/${nickname}/${appName}/`;
}

/**
 * ファイルをS3にアップロードする
 */
export async function writeFile(
  nickname: string,
  appName: string,
  filePath: string,
  content: string,
  mode: "overwrite" | "append" = "overwrite"
): Promise<void> {
  const key = `${getAppPrefix(nickname, appName)}${filePath}`;

  let finalContent = content;

  // appendモードの場合、既存内容に追記する
  if (mode === "append") {
    const existing = await readFileContent(nickname, appName, filePath);
    if (existing !== null) {
      finalContent = existing + content;
    }
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: finalContent,
      ContentType: detectContentType(filePath),
    })
  );
}

/**
 * ファイル内容をS3から読み込む
 * ファイルが存在しない場合はnullを返す
 */
export async function readFileContent(
  nickname: string,
  appName: string,
  filePath: string
): Promise<string | null> {
  const key = `${getAppPrefix(nickname, appName)}${filePath}`;

  try {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    if (!result.Body) return null;

    // ストリームを文字列に変換
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch (err: unknown) {
    // ファイルが存在しない場合はnullを返す
    if (
      err instanceof Error &&
      "name" in err &&
      (err as { name: string }).name === "NoSuchKey"
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * アプリのファイル一覧をS3から取得する
 */
export async function listFiles(
  nickname: string,
  appName: string
): Promise<{ path: string; size: number; lastModified: Date }[]> {
  const prefix = getAppPrefix(nickname, appName);
  const files: { path: string; size: number; lastModified: Date }[] = [];
  let continuationToken: string | undefined;

  // ページネーションを処理する
  do {
    const result = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of result.Contents ?? []) {
      if (!obj.Key) continue;
      files.push({
        path: obj.Key.replace(prefix, ""),
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ?? new Date(),
      });
    }

    continuationToken = result.NextContinuationToken;
  } while (continuationToken);

  return files;
}

/**
 * アプリの全ファイルをS3から削除する
 */
export async function deleteAppFiles(
  nickname: string,
  appName: string
): Promise<void> {
  const files = await listFiles(nickname, appName);
  if (files.length === 0) return;

  const prefix = getAppPrefix(nickname, appName);

  // S3は一度に1000件まで削除可能
  const chunks = chunkArray(files, 1000);
  for (const chunk of chunks) {
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: {
          Objects: chunk.map((f) => ({ Key: `${prefix}${f.path}` })),
        },
      })
    );
  }
}

/**
 * アプリのファイル存在状況を確認する（Dockerfile自動生成のため）
 */
export async function detectAppFiles(
  nickname: string,
  appName: string
): Promise<{
  hasPy: boolean;
  hasJava: boolean;
  hasPackageJson: boolean;
  hasHtml: boolean;
  hasDockerfile: boolean;
  hasRequirements: boolean;
  hasPomXml: boolean;
  fileList: string[];
}> {
  const files = await listFiles(nickname, appName);
  const fileList = files.map((f) => f.path);

  return {
    hasPy: fileList.some((f) => f.endsWith(".py")),
    hasJava: fileList.some((f) => f.endsWith(".java")),
    hasPackageJson: fileList.includes("package.json"),
    hasHtml: fileList.some((f) => f.endsWith(".html")),
    hasDockerfile: fileList.includes("Dockerfile"),
    hasRequirements: fileList.includes("requirements.txt"),
    hasPomXml: fileList.includes("pom.xml"),
    fileList,
  };
}

/**
 * S3オブジェクトのContent-Typeをファイル名から推定する
 */
function detectContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    py: "text/x-python",
    js: "application/javascript",
    ts: "application/typescript",
    html: "text/html",
    css: "text/css",
    json: "application/json",
    md: "text/markdown",
    txt: "text/plain",
    java: "text/x-java",
    xml: "application/xml",
    sh: "text/x-shellscript",
    yml: "application/yaml",
    yaml: "application/yaml",
  };
  return types[ext ?? ""] ?? "text/plain";
}

/**
 * 配列を指定サイズのチャンクに分割する
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
