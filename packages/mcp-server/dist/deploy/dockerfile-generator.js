"use strict";
/**
 * Dockerfile 自動生成モジュール
 * ランタイムを自動検出してDockerfileを生成する
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_REQUIREMENTS_TXT = void 0;
exports.generateDockerfile = generateDockerfile;
/**
 * ファイル構成からDockerfileを自動生成する
 * 優先順位: カスタムDockerfile > Python > Java > Node.js > 静的HTML
 */
function generateDockerfile(files) {
    // カスタムDockerfileが存在する場合はそちらを使用
    if (files.hasDockerfile) {
        return { content: null, runtime: "custom" };
    }
    // Pythonアプリの検出
    if (files.hasPy) {
        return generatePythonDockerfile(files.hasRequirements);
    }
    // Javaアプリの検出
    if (files.hasJava || files.hasPomXml) {
        return generateJavaDockerfile(files.hasPomXml);
    }
    // Node.jsアプリの検出
    if (files.hasPackageJson) {
        return generateNodeDockerfile();
    }
    // 静的HTMLアプリの検出
    if (files.hasHtml) {
        return generateStaticDockerfile();
    }
    // サポートされているファイルが見つからない場合はエラー
    throw new Error("サポートされているファイルが見つかりません。" +
        ".py, .java, package.json, .html のいずれかが必要です。");
}
/**
 * Python用Dockerfileを生成する
 * requirements.txtがない場合はflask+gunicornで自動生成する
 */
function generatePythonDockerfile(hasRequirements) {
    const dockerfile = `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8080
# app.py または main.py を自動検出してgunicornで起動する
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:\${PORT} \$(ls app.py main.py 2>/dev/null | head -1 | sed 's/.py//'):app 2>/dev/null || gunicorn --bind 0.0.0.0:\${PORT} \$(ls *.py | head -1 | sed 's/.py//'):app"]
`;
    return {
        content: dockerfile,
        runtime: "python",
        // requirements.txtがない場合は自動生成が必要
        needsRequirementsTxt: !hasRequirements,
    };
}
/**
 * Java(Maven)用Dockerfileを生成する
 * マルチステージビルドで最終イメージを軽量化する
 */
function generateJavaDockerfile(hasPomXml) {
    if (hasPomXml) {
        // Mavenプロジェクトの場合
        const dockerfile = `FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre-slim
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
ENV PORT=8080
CMD ["java", "-jar", "app.jar", "--server.port=\${PORT}"]
`;
        return { content: dockerfile, runtime: "java" };
    }
    // pom.xmlなし（Gradleまたは手動ビルド）の場合
    const dockerfile = `FROM eclipse-temurin:21-jre-slim
WORKDIR /app
COPY *.jar app.jar
ENV PORT=8080
CMD ["java", "-jar", "app.jar", "--server.port=\${PORT}"]
`;
    return { content: dockerfile, runtime: "java" };
}
/**
 * Node.js用Dockerfileを生成する
 * npm ciで本番用パッケージのみインストールする
 */
function generateNodeDockerfile() {
    const dockerfile = `FROM node:20-slim
WORKDIR /app
COPY package*.json .
RUN npm ci --only=production
COPY . .
ENV PORT=8080
# package.jsonのstartスクリプトで起動する（必須）
CMD ["npm", "start"]
`;
    return { content: dockerfile, runtime: "nodejs" };
}
/**
 * 静的HTML用Dockerfileを生成する
 * nginxで配信し、ポートを8080に統一する
 */
function generateStaticDockerfile() {
    const dockerfile = `FROM nginx:alpine
# nginx のデフォルトポートを8080に変更する
RUN sed -i 's/listen       80;/listen       8080;/g' /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE 8080
`;
    return { content: dockerfile, runtime: "static" };
}
/**
 * requirements.txtが存在しない場合に自動生成するデフォルト内容
 */
exports.DEFAULT_REQUIREMENTS_TXT = "flask\ngunicorn\n";
//# sourceMappingURL=dockerfile-generator.js.map