# Python アプリ用 Dockerfile テンプレート
# gunicorn + Flask で起動する。PORT 環境変数を必ず設定すること。
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8080
# app.py → main.py → その他の *.py の順で自動検出して起動する
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} $(ls app.py main.py 2>/dev/null | head -1 | sed 's/.py//'):app 2>/dev/null || gunicorn --bind 0.0.0.0:${PORT} $(ls *.py | head -1 | sed 's/.py//'):app"]
