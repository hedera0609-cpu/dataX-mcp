/**
 * 共通定数・ユーティリティ
 * 複数モジュールで共有する定数とヘルパー関数
 */
/** アプリ名のバリデーション正規表現（英小文字・数字・ハイフン、2〜32文字） */
export declare const APP_NAME_REGEX: RegExp;
/**
 * ファイルパスのサニタイズ（パストラバーサル攻撃を防ぐ）
 */
export declare function sanitizePath(filePath: string): string;
//# sourceMappingURL=constants.d.ts.map