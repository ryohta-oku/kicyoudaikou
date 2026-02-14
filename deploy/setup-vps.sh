#!/bin/bash
# エックスサーバーVPS 初期セットアップスクリプト
# 使い方: root で SSH ログイン後、このスクリプトを実行
#   curl -sL https://raw.githubusercontent.com/ryohta-oku/kicyoudaikou/main/deploy/setup-vps.sh | bash
set -e

echo "=== VPS 初期セットアップ開始 ==="

# 1. システムアップデート
echo ">>> システムアップデート..."
apt update && apt upgrade -y

# 2. 必要パッケージ
echo ">>> 必要パッケージをインストール..."
apt install -y curl git nginx ufw

# 3. Node.js 20 LTS インストール
echo ">>> Node.js 20 LTS をインストール..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 4. PM2 インストール
echo ">>> PM2 をインストール..."
npm install -g pm2

# 5. deploy ユーザー作成
echo ">>> deploy ユーザーを作成..."
if ! id "deploy" &>/dev/null; then
    adduser --disabled-password --gecos "" deploy
    mkdir -p /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    touch /home/deploy/.ssh/authorized_keys
    chmod 600 /home/deploy/.ssh/authorized_keys
    chown -R deploy:deploy /home/deploy/.ssh
fi

# 6. アプリ用ディレクトリ作成
echo ">>> アプリディレクトリを作成..."
mkdir -p /var/www/kicyoudaikou
chown deploy:deploy /var/www/kicyoudaikou

# 7. GitHub からリポジトリをクローン
echo ">>> GitHub からリポジトリをクローン..."
if [ ! -d "/var/www/kicyoudaikou/.git" ]; then
    sudo -u deploy git clone https://github.com/ryohta-oku/kicyoudaikou.git /var/www/kicyoudaikou
else
    echo "    リポジトリは既にクローン済みです"
fi

# 8. ファイアウォール設定
echo ">>> ファイアウォールを設定..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# 9. Nginx 設定
echo ">>> Nginx を設定..."
rm -f /etc/nginx/sites-enabled/default
cp /var/www/kicyoudaikou/deploy/nginx-kicyoudaikou.conf /etc/nginx/sites-available/kicyoudaikou
ln -sf /etc/nginx/sites-available/kicyoudaikou /etc/nginx/sites-enabled/kicyoudaikou
nginx -t && systemctl reload nginx

# 10. PM2 を systemd に登録（自動起動）
echo ">>> PM2 自動起動を設定..."
env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy

# 11. アップロードディレクトリ作成
echo ">>> アップロードディレクトリを作成..."
mkdir -p /var/www/kicyoudaikou/public/uploads
chown deploy:deploy /var/www/kicyoudaikou/public/uploads

echo ""
echo "=== セットアップ完了！ ==="
echo ""
echo "=== 残りの手順（手動で実行してください）==="
echo ""
echo "1. VPS に .env ファイルを作成:"
echo "   sudo -u deploy nano /var/www/kicyoudaikou/.env"
echo "   （.env.production.example を参考に値を設定）"
echo ""
echo "2. 初回ビルド＆起動:"
echo "   sudo -u deploy bash -c 'cd /var/www/kicyoudaikou && npm ci && npx prisma generate && npm run build && npx prisma migrate deploy && pm2 start ecosystem.config.cjs'"
echo ""
echo "3. GitHub の Secrets を設定（Settings > Secrets and variables > Actions）:"
echo "   VPS_HOST     = 162.43.7.199"
echo "   VPS_USER     = deploy"
echo "   VPS_PORT     = 22"
echo "   VPS_SSH_KEY  = （SSHの秘密鍵の内容をコピペ）"
echo ""
echo "4. GitHub Actions 用の SSH キーを VPS に登録:"
echo "   ssh-keygen -t ed25519 -C 'github-actions' -f ~/.ssh/github_actions"
echo "   cat ~/.ssh/github_actions.pub >> /home/deploy/.ssh/authorized_keys"
echo "   cat ~/.ssh/github_actions  # ← この内容を VPS_SSH_KEY に登録"
echo ""
