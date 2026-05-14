/**
 * 共通定数・ユーティリティ
 * 複数モジュールで共有する定数とヘルパー関数
 */

/** アプリ名のバリデーション正規表現（英小文字・数字・ハイフン、2〜32文字） */
export const APP_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

/**
 * ファイルパスのサニタイズ（パストラバーサル攻撃を防ぐ）
 */
export function sanitizePath(filePath: string): string {
  if (
    filePath.includes("..") ||
    filePath.includes("//") ||
    filePath.startsWith("/") ||
    filePath.includes("\\")
  ) {
    throw new Error(
      `許可されていないパスです: ${filePath}` +
        " (.., //, 先頭/, バックスラッシュは使用不可)"
    );
  }
  return filePath;
}

// =====================================
// シークレットスキャン（P1セキュリティ対策）
// =====================================

/** 検出対象のシークレットパターン定義 */
const SECRET_PATTERNS: { pattern: RegExp; label: string }[] = [
  // AWS アクセスキー
  { pattern: /AKIA[0-9A-Z]{16}/,                                    label: "AWS Access Key ID" },
  // AWS シークレットキー（40文字の英数字+記号）
  { pattern: /(?:AWS_SECRET|aws_secret)[_\s]*[=:]\s*['"]?[A-Za-z0-9/+]{40}/i, label: "AWS Secret Access Key" },
  // 秘密鍵ファイル
  { pattern: /-----BEGIN\s(?:RSA\s|EC\s|OPENSSH\s)?PRIVATE KEY-----/, label: "Private Key" },
  // 汎用パスワードのハードコーディング（8文字以上）
  { pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{8,}['"]/i, label: "Hardcoded Password" },
  // APIキーのハードコーディング（16文字以上）
  { pattern: /(?:api_key|apikey|api-key)\s*[=:]\s*['"][^'"]{16,}['"]/i, label: "Hardcoded API Key" },
  // シークレット/トークンのハードコーディング（16文字以上）
  { pattern: /(?:secret|token|access_token)\s*[=:]\s*['"][^'"]{16,}['"]/i, label: "Hardcoded Secret/Token" },
];

/** 除外拡張子（バイナリ・画像は対象外） */
const EXCLUDED_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".pdf", ".zip", ".tar", ".gz", ".wasm",
];

export interface SecretScanResult {
  detected: boolean;
  findings: { label: string; line: number }[];
}

/**
 * ファイル内容をスキャンして機密情報が含まれないか確認する
 * 検出された場合は findings に詳細を返す
 */
export function scanForSecrets(filePath: string, content: string): SecretScanResult {
  // バイナリ系ファイルはスキップ
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (EXCLUDED_EXTENSIONS.includes(ext)) {
    return { detected: false, findings: [] };
  }

  const findings: { label: string; line: number }[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, label } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ label, line: i + 1 });
        break; // 1行につき1件のみ記録
      }
    }
  }

  return { detected: findings.length > 0, findings };
}
