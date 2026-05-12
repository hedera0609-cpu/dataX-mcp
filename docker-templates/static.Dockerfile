# 静的 HTML アプリ用 Dockerfile テンプレート
# nginx でホスティングする。デフォルトポートを 8080 に統一する。
FROM nginx:alpine
# ECS の規約に合わせてリッスンポートを 80 → 8080 に変更する
RUN sed -i 's/listen       80;/listen       8080;/g' /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE 8080
