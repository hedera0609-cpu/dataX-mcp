/**
 * ローカル用ストレージ
 * AWSのS3の代わりに ~/.datax/sources/{nickname}/{appName}/ にファイルを保存する
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const SOURCES_DIR = path.join(os.homedir(), ".datax", "sources");

// =====================================
// パスのユーティリティ
// =====================================

function getAppDir(nickname: string, appName: string): string {
  return path.join(SOURCES_DIR, nickname, appName);
}

// =====================================
// ファイル操作
// =====================================

/**
 * ファイルをローカルに書き込む
 */
export function writeFile(
  nickname: string,
  appName: string,
  filePath: string,
  content: string,
  mode: "overwrite" | "append" = "overwrite"
): void {
  const appDir = getAppDir(nickname, appName);
  const fullPath = path.join(appDir, filePath);

  // ディレクトリを再帰的に作成する
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  if (mode === "append" && fs.existsSync(fullPath)) {
    fs.appendFileSync(fullPath, content, "utf-8");
  } else {
    fs.writeFileSync(fullPath, content, "utf-8");
  }
}

/**
 * ファイルの内容を読み込む（存在しない場合はnullを返す）
 */
export function readFileContent(
  nickname: string,
  appName: string,
  filePath: string
): string | null {
  const fullPath = path.join(getAppDir(nickname, appName), filePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf-8");
}

/**
 * アプリのファイル一覧を返す
 */
export function listFiles(
  nickname: string,
  appName: string
): { path: string; size: number; lastModified: Date }[] {
  const appDir = getAppDir(nickname, appName);
  if (!fs.existsSync(appDir)) return [];

  const results: { path: string; size: number; lastModified: Date }[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const stat = fs.statSync(fullPath);
        results.push({
          path: path.relative(appDir, fullPath).replace(/\\/g, "/"),
          size: stat.size,
          lastModified: stat.mtime,
        });
      }
    }
  }

  walk(appDir);
  return results;
}

/**
 * アプリのファイルをすべて削除する
 */
export function deleteAppFiles(nickname: string, appName: string): void {
  const appDir = getAppDir(nickname, appName);
  if (fs.existsSync(appDir)) {
    fs.rmSync(appDir, { recursive: true, force: true });
  }
}

/**
 * アプリのファイル存在状況を確認する（Dockerfile自動生成のため）
 */
export function detectAppFiles(nickname: string, appName: string): {
  hasPy: boolean;
  hasJava: boolean;
  hasPackageJson: boolean;
  hasHtml: boolean;
  hasDockerfile: boolean;
  hasRequirements: boolean;
  hasPomXml: boolean;
  fileList: string[];
} {
  const files = listFiles(nickname, appName);
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
 * アプリのソースをデプロイ用の一時ディレクトリにコピーする
 */
export function copyToDir(
  nickname: string,
  appName: string,
  destDir: string
): void {
  const appDir = getAppDir(nickname, appName);
  if (!fs.existsSync(appDir)) return;

  fs.cpSync(appDir, destDir, { recursive: true });
}
