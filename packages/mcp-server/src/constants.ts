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
