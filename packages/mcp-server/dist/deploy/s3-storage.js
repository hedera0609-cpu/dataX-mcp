"use strict";
/**
 * S3 ストレージモジュール
 * アプリのソースファイルをS3で管理する
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeFile = writeFile;
exports.readFileContent = readFileContent;
exports.listFiles = listFiles;
exports.deleteAppFiles = deleteAppFiles;
exports.detectAppFiles = detectAppFiles;
const client_s3_1 = require("@aws-sdk/client-s3");
// S3 バケット名（環境変数から取得）
const BUCKET_NAME = process.env.S3_BUCKET ?? "datax-app-sources";
// S3 クライアントの初期化
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION ?? "ap-northeast-2",
});
/**
 * S3 キーのプレフィックスを生成する
 * パス: apps/{nickname}/{appName}/
 */
function getAppPrefix(nickname, appName) {
    return `apps/${nickname}/${appName}/`;
}
/**
 * ファイルをS3にアップロードする
 */
async function writeFile(nickname, appName, filePath, content, mode = "overwrite") {
    const key = `${getAppPrefix(nickname, appName)}${filePath}`;
    let finalContent = content;
    // appendモードの場合、既存内容に追記する
    if (mode === "append") {
        const existing = await readFileContent(nickname, appName, filePath);
        if (existing !== null) {
            finalContent = existing + content;
        }
    }
    await s3Client.send(new client_s3_1.PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: finalContent,
        ContentType: detectContentType(filePath),
    }));
}
/**
 * ファイル内容をS3から読み込む
 * ファイルが存在しない場合はnullを返す
 */
async function readFileContent(nickname, appName, filePath) {
    const key = `${getAppPrefix(nickname, appName)}${filePath}`;
    try {
        const result = await s3Client.send(new client_s3_1.GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        }));
        if (!result.Body)
            return null;
        // ストリームを文字列に変換
        return await result.Body.transformToString("utf-8");
    }
    catch (err) {
        // ファイルが存在しない場合はnullを返す
        if (err?.name === "NoSuchKey")
            return null;
        throw err;
    }
}
/**
 * アプリのファイル一覧をS3から取得する
 */
async function listFiles(nickname, appName) {
    const prefix = getAppPrefix(nickname, appName);
    const files = [];
    let continuationToken;
    // ページネーションを処理する
    do {
        const result = await s3Client.send(new client_s3_1.ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        }));
        for (const obj of result.Contents ?? []) {
            if (!obj.Key)
                continue;
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
async function deleteAppFiles(nickname, appName) {
    const files = await listFiles(nickname, appName);
    if (files.length === 0)
        return;
    const prefix = getAppPrefix(nickname, appName);
    // S3は一度に1000件まで削除可能
    const chunks = chunkArray(files, 1000);
    for (const chunk of chunks) {
        await s3Client.send(new client_s3_1.DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: {
                Objects: chunk.map((f) => ({ Key: `${prefix}${f.path}` })),
            },
        }));
    }
}
/**
 * アプリのファイル存在状況を確認する（Dockerfile自動生成のため）
 */
async function detectAppFiles(nickname, appName) {
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
function detectContentType(filePath) {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const types = {
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
function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}
//# sourceMappingURL=s3-storage.js.map