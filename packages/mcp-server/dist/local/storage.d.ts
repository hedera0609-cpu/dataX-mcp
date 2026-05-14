/**
 * ローカル用ストレージ
 * AWSのS3の代わりに ~/.datax/sources/{nickname}/{appName}/ にファイルを保存する
 */
/**
 * ファイルをローカルに書き込む
 */
export declare function writeFile(nickname: string, appName: string, filePath: string, content: string, mode?: "overwrite" | "append"): void;
/**
 * ファイルの内容を読み込む（存在しない場合はnullを返す）
 */
export declare function readFileContent(nickname: string, appName: string, filePath: string): string | null;
/**
 * アプリのファイル一覧を返す
 */
export declare function listFiles(nickname: string, appName: string): {
    path: string;
    size: number;
    lastModified: Date;
}[];
/**
 * アプリのファイルをすべて削除する
 */
export declare function deleteAppFiles(nickname: string, appName: string): void;
/**
 * アプリのファイル存在状況を確認する（Dockerfile自動生成のため）
 */
export declare function detectAppFiles(nickname: string, appName: string): {
    hasPy: boolean;
    hasJava: boolean;
    hasPackageJson: boolean;
    hasHtml: boolean;
    hasDockerfile: boolean;
    hasRequirements: boolean;
    hasPomXml: boolean;
    fileList: string[];
};
/**
 * アプリのソースをデプロイ用の一時ディレクトリにコピーする
 */
export declare function copyToDir(nickname: string, appName: string, destDir: string): void;
//# sourceMappingURL=storage.d.ts.map