# デプロイ（外部サーバーへの公開）

このゲームは **静的サイト**（HTML/CSS/JS のみ、サーバー処理なし）なので、
どんな静的ホスティングにもそのまま置けます。ビルド作業は不要です。

## 1. GitHub Pages（同梱ワークフローで自動公開）

リポジトリには `.github/workflows/deploy-pages.yml` が入っています。

1. `main` ブランチに push する。
2. リポジトリの **Settings → Pages → Build and deployment → Source** を
   **「GitHub Actions」** に設定する。
3. 以降、push するたびに自動デプロイされ、
   `https://incomebase0108-alt.github.io/cover-battle/` で公開されます。

## 2. Netlify / Vercel / Cloudflare Pages

いずれも「リポジトリを連携 → ビルドコマンドなし → 公開ディレクトリ = リポジトリ直下」で動きます。

| 項目 | 設定 |
|---|---|
| Build command | （空欄でOK） |
| Output / Publish directory | `.`（ルート） |

ドラッグ＆ドロップ対応のサービスなら、フォルダごと放り込むだけでも公開できます。

## 3. 自前のサーバー（VPS / nginx など）

ファイルをドキュメントルートに置くだけです。

```bash
# 例: nginx のドキュメントルートにコピー
sudo cp -r . /var/www/cover-battle/
# nginx で /var/www/cover-battle を配信するよう設定して reload
```

ローカル確認用の簡易サーバー:

```bash
python3 -m http.server 8000   # → http://localhost:8000
```

## メモ：本格的な「8人マルチプレイ」について

現状はオフライン（自分1人＋AI）です。**複数の人間が同時にネット越しで対戦**する場合は、
状態を同期する **ゲームサーバー（WebSocket など）** が別途必要になります。
静的ホスティングはクライアント（この画面）の配信専用で、対戦同期はできません。
将来はクライアントを静的ホスティング、対戦同期を別のリアルタイムサーバー、という構成を想定しています
（ロードマップ参照）。
