# Node.js アプリ用 Dockerfile テンプレート
# package.json に "start" スクリプトが必須
FROM node:20-slim
WORKDIR /app
# package.json と package-lock.json を先にコピーしてキャッシュを活用する
COPY package*.json .
RUN npm ci --only=production
COPY . .
ENV PORT=8080
CMD ["npm", "start"]
