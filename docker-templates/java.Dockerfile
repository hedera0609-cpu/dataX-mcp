# Java (Maven) アプリ用 Dockerfile テンプレート
# マルチステージビルドで最終イメージを軽量化する
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
# 依存関係のキャッシュ層を最大限活用する
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre-slim
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
ENV PORT=8080
CMD ["java", "-jar", "app.jar", "--server.port=${PORT}"]
