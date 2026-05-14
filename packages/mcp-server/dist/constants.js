"use strict";
/**
 * 共通定数・ユーティリティ
 * 複数モジュールで共有する定数とヘルパー関数
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_NAME_REGEX = void 0;
exports.sanitizePath = sanitizePath;
/** アプリ名のバリデーション正規表現（英小文字・数字・ハイフン、2〜32文字） */
exports.APP_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
/**
 * ファイルパスのサニタイズ（パストラバーサル攻撃を防ぐ）
 */
function sanitizePath(filePath) {
    if (filePath.includes("..") ||
        filePath.includes("//") ||
        filePath.startsWith("/") ||
        filePath.includes("\\")) {
        throw new Error(`許可されていないパスです: ${filePath}` +
            " (.., //, 先頭/, バックスラッシュは使用不可)");
    }
    return filePath;
}
//# sourceMappingURL=constants.js.map