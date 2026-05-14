"use strict";
/**
 * ローカル用ストレージ
 * AWSのS3の代わりに ~/.datax/sources/{nickname}/{appName}/ にファイルを保存する
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeFile = writeFile;
exports.readFileContent = readFileContent;
exports.listFiles = listFiles;
exports.deleteAppFiles = deleteAppFiles;
exports.detectAppFiles = detectAppFiles;
exports.copyToDir = copyToDir;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const SOURCES_DIR = path.join(os.homedir(), ".datax", "sources");
// =====================================
// パスのユーティリティ
// =====================================
function getAppDir(nickname, appName) {
    return path.join(SOURCES_DIR, nickname, appName);
}
// =====================================
// ファイル操作
// =====================================
/**
 * ファイルをローカルに書き込む
 */
function writeFile(nickname, appName, filePath, content, mode = "overwrite") {
    const appDir = getAppDir(nickname, appName);
    const fullPath = path.join(appDir, filePath);
    // ディレクトリを再帰的に作成する
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    if (mode === "append" && fs.existsSync(fullPath)) {
        fs.appendFileSync(fullPath, content, "utf-8");
    }
    else {
        fs.writeFileSync(fullPath, content, "utf-8");
    }
}
/**
 * ファイルの内容を読み込む（存在しない場合はnullを返す）
 */
function readFileContent(nickname, appName, filePath) {
    const fullPath = path.join(getAppDir(nickname, appName), filePath);
    if (!fs.existsSync(fullPath))
        return null;
    return fs.readFileSync(fullPath, "utf-8");
}
/**
 * アプリのファイル一覧を返す
 */
function listFiles(nickname, appName) {
    const appDir = getAppDir(nickname, appName);
    if (!fs.existsSync(appDir))
        return [];
    const results = [];
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            }
            else {
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
function deleteAppFiles(nickname, appName) {
    const appDir = getAppDir(nickname, appName);
    if (fs.existsSync(appDir)) {
        fs.rmSync(appDir, { recursive: true, force: true });
    }
}
/**
 * アプリのファイル存在状況を確認する（Dockerfile自動生成のため）
 */
function detectAppFiles(nickname, appName) {
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
function copyToDir(nickname, appName, destDir) {
    const appDir = getAppDir(nickname, appName);
    if (!fs.existsSync(appDir))
        return;
    fs.cpSync(appDir, destDir, { recursive: true });
}
//# sourceMappingURL=storage.js.map