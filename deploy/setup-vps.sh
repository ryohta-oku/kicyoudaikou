#!/bin/bash
# エックスサーバーVPS 初期セットアップスクリプト
# 使い方: root で SSH ログイン後、このスクリプトを実行
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

# 7. bare git リポジトリ作成
echo ">>> Git bare リポジトリを作成..."
mkdir -p /home/deploy/repos
cd /home/deploy/repos
if [ ! -d "kicyoudaikou.git" ]; then
    git init --bare kicyoudaikou.git
fi
chown -R deploy:deploy /home/deploy/repos

# 8. ファイアウォール設定
echo ">>> ファイアウォールを設定..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# 9. Nginx 設定
echo ">>> Nginx を設定..."
# default サイトを無効化
rm -f /etc/nginx/sites-enabled/default

echo ">>> セットアップ完了！"
echo ""
echo "=== 次のステップ ==="
echo "1. ローカルPCで SSH キーを生成:"
echo "   ssh-keygen -t ed25519 -C \"your-email@example.com\""
echo ""
echo "2. 公開鍵を VPS に登録:"
echo "   ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@162.43.7.199"
echo ""
echo "3. .env ファイルを VPS に作成:"
echo "   ssh deploy@162.43.7.199"
echo "   nano /var/www/kicyoudaikou/.env"
echo ""
echo "4. post-receive フックを設置（ローカルPCで git push 後に自動実行）"
echo ""
