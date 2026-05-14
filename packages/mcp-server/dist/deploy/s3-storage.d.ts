/**
 * S3 ストレージモジュール
 * アプリのソースファイルをS3で管理する
 */
/**
 * ファイルをS3にアップロードする
 */
export declare function writeFile(nickname: string, appName: string, filePath: string, content: string, mode?: "overwrite" | "append"): Promise<void>;
/**
 * ファイル内容をS3から読み込む
 * ファイルが存在しない場合はnullを返す
 */
export declare function readFileContent(nickname: string, appName: string, filePath: string): Promise<string | null>;
/**
 * アプリのファイル一覧をS3から取得する
 */
export declare function listFiles(nickname: string, appName: string): Promise<{
    path: string;
    size: number;
    lastModified: Date;
}[]>;
/**
 * アプリの全ファイルをS3から削除する
 */
export declare function deleteAppFiles(nickname: string, appName: string): Promise<void>;
/**
 * アプリのファイル存在状況を確認する（Dockerfile自動生成のため）
 */
export declare function detectAppFiles(nickname: string, appName: string): Promise<{
    hasPy: boolean;
    hasJava: boolean;
    hasPackageJson: boolean;
    hasHtml: boolean;
    hasDockerfile: boolean;
    hasRequirements: boolean;
    hasPomXml: boolean;
    fileList: string[];
}>;
//# sourceMappingURL=s3-storage.d.ts.map