/**
 * DataX MCP サーバー（ローカルモード）
 * AWSを使わず、ローカルのDockerとファイルシステムでアプリを動かす
 *
 * [必要なもの]
 * - Docker Desktop（起動済みであること）
 * - Node.js 18以上
 * - DATAX_NICKNAME 環境変数
 *
 * [制限事項]
 * - アプリは localhost:{ポート} でのみアクセス可能
 * - PCを閉じるとアプリも停止する（docker restart unless-stopped で自動再起動）
 * - ポート範囲: 18100〜18199（最大100アプリ）
 */
export {};
//# sourceMappingURL=index.d.ts.map