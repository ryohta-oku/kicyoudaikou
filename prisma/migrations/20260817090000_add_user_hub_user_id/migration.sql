-- client-hub 側の User.id を持つ列。
--
-- 席（starNN.cocoboshi@gmail.com）を次の利用者へ引き継いだとき、新しい方が
-- ログインした瞬間に**メール一致で前の方の行に吸い込まれる**のを防ぐ。
-- 吸い込まれると Folder.firstCheckById や WorkLog.userId が前の方を指したままになり、
-- ダブルチェックの「作業者と確認者が別人か」の判定も作業記録の名義も壊れる。
--
-- 引き当ての順は src/lib/auth.ts を参照:
--   ① id = hub.id → ② hubUserId = hub.id → ③ email 一致かつ hubUserId が null → ④ 新規
--
-- UNIQUE にしているのは、1つの共通アカウントが2つのローカル行を持たないようにするため。
-- SQLite の UNIQUE は NULL を互いに別物として扱うので、未設定の行は何行あってもよい。
ALTER TABLE "User" ADD COLUMN "hubUserId" TEXT;
CREATE UNIQUE INDEX "User_hubUserId_key" ON "User"("hubUserId");

-- backfill: 共通ログインが作った影の行だけ埋める。
--
-- password が空 = ログイン時に client-hub から作られた行で、id は hub の id と一致する。
--
-- **共通ログイン導入前からある行（password あり）は null のまま残す。**
-- 本番の奥さんの行はローカル uuid で hub id と違うので、ここを埋めると
-- ③のメール引き当てが効かなくなり、次のログインで別の行が作られて
-- 249件の作業記録（WorkLog / WorkSession）が孤児になる。
UPDATE "User" SET "hubUserId" = "id" WHERE "password" = '';
