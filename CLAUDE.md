# プロジェクトルール

## Git ワークフロー
- コード変更後は必ずコミット＆プッシュすること
- コミットメッセージは日本語で、変更内容が分かるように書くこと
- **main ブランチへのマージは絶対に禁止。ユーザーが「デプロイして」と明示的に指示した場合のみ行うこと**
- 「コミットして」→ 作業ブランチにコミット＆プッシュのみ（本番に影響しない）
- 「デプロイして」→ main にマージ → GitHub Actions で本番自動デプロイ
- 普段の開発は作業ブランチ上で行う

## DB マイグレーション
- ローカル開発でも **`prisma migrate dev`** を使うこと（`prisma db push` は禁止）
- スキーマ変更時は必ずマイグレーションファイルが生成されることを確認する
- 本番は `prisma migrate deploy` で適用されるため、マイグレーションファイルがないとスキーマが反映されない

## 認証と役割

このアプリの役割は `admin` / `instructor` / `user_a` / `user_b` の4つ。
2026-09-01 に AB多機能 → A型のみになったので `user_b` は新規に割り当てない
（既存アカウントが残っているので値としては生かす）。

定義は `src/lib/roles.ts` の1か所。**`/admin` に入れるのは `ADMIN_AREA_ROLES`
（admin / instructor）** ―― ここは以前 `staff` で絞っていて、記帳代行に存在しない
役割だったため指導員が締め出されていた。

### 共通ログイン（`SHARED_LOGIN="on"`）

`on` のとき、ログインの照合を **client-hub に委ねる**（ここぼし・goal-compass・
houjin-db・seo-master と同じ形）。それ以外は従来どおりローカルの `User` で照合する。

- **スイッチを残すのはログインが業務の玄関だから。** おかしければ VPS で
  `SHARED_LOGIN` を消して `pm2 restart` するだけで戻る
- 役割は**境界で写す**: `admin→admin` / `staff→instructor` / `member→user_a`。
  語彙を統一しないのは `user_a` が「A型の利用者」という業務上の意味を持ち、
  ダブルチェックの条件を書いた19ファイル・88箇所がそれに依存しているため
- ローカルの `User` は**影**として残す。`WorkSession.userId` / `WorkLog.userId` /
  `Folder.firstCheckById` が `User.id` を文字列で参照している（FK は無い）ので、
  既存行は **id を維持したまま**役割と氏名だけ同期する
- **`on` のときアカウント操作は 409 で断る**（`src/lib/shared-login.ts`）。
  追加・パスワード変更・役割変更・削除・初期登録・招待の6経路。
  効かない操作を「押せてしまう」状態を作らない。管理画面もボタンを出さない

### `plainPassword`（未撤去）

`User.plainPassword` にパスワードが平文で入っている。これは不始末ではなく機能で、
利用者がパスワードを忘れたとき指導員が管理画面で確認して伝えるために使っている。

**撤去は共通ログインを本番で `on` にしてから。** 先に消すと従来の経路が動かなくなる。
client-hub 側は同じ必要を平文なしで満たしている（URLのトークンと `AUTH_SECRET` から
導出した鍵で AES-256-GCM 暗号化し、期間限定URLで見せる）。

## API レスポンスルール
- **バイナリデータ（fileData, imageData）は JSON レスポンスに含めない**
- ファイル配信は `/api/files` エンドポイント経由のみ
- Prisma の `include` でリレーションを含む場合は `select` で必要なフィールドのみ指定する

## デザインルール

### コンセプト
就労支援の利用者が使う業務ツール。**使いやすさ第一**だが、きれいなデザインでやる気が出る仕上がりにする。

### フォント
- **メイン**: Noto Sans JP（`next/font/google` で読み込み）
- **ルートサイズ**: 18px（年配ユーザー・視認性重視）
- **ウェイト**: 見出し 900（Black）、小見出し 700（Bold）、本文 400（Regular）
- サイズ差は大胆に（見出しと本文で3倍以上の差）

### カラーパレット

#### プライマリ: Teal（信頼感）
- メインアクション: `teal-600`（#0d9488）
- ホバー: `teal-700`（#0f766e）
- 薄い背景: `teal-50`（#f0fdfa）
- バッジ・ラベル: `teal-100`〜`teal-200`
- テキスト強調: `teal-800`〜`teal-900`

#### アクセント: Amber（前向きなエネルギー）
- 注目ボタン・CTA: `amber-500`（#f59e0b）
- 警告: `amber-50`〜`amber-100` + `amber-700`〜`amber-800`
- 既存のAmber用途（警告バッジ等）はそのまま維持

#### セマンティック
- 成功: `green-*`
- エラー: `red-*`
- 情報: `teal-*`（旧 blue を置換）

#### 禁止
- `blue-*` を新規で使わない（すべて `teal-*` に統一済み）

### 背景
- ページ全体: ソフトグラデーション `linear-gradient(135deg, #f0fdfa 0%, #f5f3ff 50%, #fefce8 100%)`
- カード: `rgba(255,255,255,0.85)` + `backdrop-filter: blur(8px)` で半透明ガラス風
- ベタ塗り白背景は避ける

### アイコン
- Lucide React で統一（変更なし）

### その他
- フォーカスリング: `focus:ring-teal-500`
- ボーダー: `border-teal-*` 系
- ステータスバッジのカラーは既存のワークフロー進捗色を維持（gray → amber → teal → indigo → purple → green → emerald → cyan）

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
