/**
 * Dockerfile 自動生成モジュール
 * ランタイムを自動検出してDockerfileを生成する
 */
export interface AppFiles {
    hasPy: boolean;
    hasJava: boolean;
    hasPackageJson: boolean;
    hasHtml: boolean;
    hasDockerfile: boolean;
    hasRequirements: boolean;
    hasPomXml: boolean;
}
export type Runtime = "python" | "java" | "nodejs" | "static" | "custom";
export interface DockerfileResult {
    content: string | null;
    runtime: Runtime;
    needsRequirementsTxt?: boolean;
}
/**
 * ファイル構成からDockerfileを自動生成する
 * 優先順位: カスタムDockerfile > Python > Java > Node.js > 静的HTML
 */
export declare function generateDockerfile(files: AppFiles): DockerfileResult;
/**
 * requirements.txtが存在しない場合に自動生成するデフォルト内容
 */
export declare const DEFAULT_REQUIREMENTS_TXT = "flask\ngunicorn\n";
//# sourceMappingURL=dockerfile-generator.d.ts.map