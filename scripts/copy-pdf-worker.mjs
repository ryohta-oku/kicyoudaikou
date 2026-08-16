/**
 * pdf.js のワーカーを public/ に置く。
 *
 * バンドラに URL を解決させる書き方（new URL(..., import.meta.url)）は
 * Turbopack だと期待どおりに解決されず、ワーカーが起動しないまま
 * PDFの描画が終わらない状態になった。
 *
 * 固定のパスに置いてしまえば、開発でも本番でも同じ挙動になる。
 * CDN を見に行かせないのは、事業所のネットワークやオフラインで
 * 動かなくなるのを避けるため。
 *
 * npm install のたびに走らせる（package.json の postinstall）。
 * **コピーを手で更新しないこと** ―― バージョンがずれると読めなくなる。
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const from = path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "build",
  "pdf.worker.min.mjs"
);
const toDir = path.join(process.cwd(), "public");
const to = path.join(toDir, "pdf.worker.min.mjs");

await mkdir(toDir, { recursive: true });
await copyFile(from, to);
console.log(`pdf.js のワーカーを置いた: ${path.relative(process.cwd(), to)}`);
