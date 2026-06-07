# Cover Battle LAN サーバーを NAS 等で 24時間動かすための Docker イメージ。
# 小型 NAS(N100 など)でも動く軽量構成。ポート 8080 で待ち受ける。
FROM node:20-alpine
WORKDIR /app

# 依存だけ先に入れてキャッシュを効かせる
COPY package*.json ./
RUN npm install --omit=dev

# ゲーム本体（js/・tests/harness.js・server.js・netclient.html ほか）を全部コピー
COPY . .

EXPOSE 8080
CMD ["node", "server.js"]
