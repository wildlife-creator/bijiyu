/**
 * キャプチャ集PDF生成スクリプト
 *
 * capture-screens.mjs の実行後に:
 *   node scripts/capture/build-pdf.mjs
 *
 * 出力: scripts/capture/output/ビジ友_キャプチャ集.pdf
 *   1画面1ページ（見出し: 画面ID + 画面名 + URL、PC版とスマホ版を並置）
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "output");
const PNG = path.join(OUT, "png");
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));

const b64 = p => fs.existsSync(p) ? `data:image/png;base64,${fs.readFileSync(p).toString("base64")}` : null;

const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

let body = `
<section class="cover">
  <h1>ビジ友 画面キャプチャ集</h1>
  <p>ステージングサイトの全画面キャプチャです。検収シート「②画面チェック一覧」とあわせてご覧ください。</p>
  <p>各ページの見出しの「画面ID」（例: CON-003）が、検収シートの画面IDと対応しています。</p>
  <p>縦に長い画面は、1ページに収まるよう縮小して掲載しています。細かな文字は、実際のサイト上でご確認ください。</p>\n  <p class="date">作成日: ${today}</p>
</section>`;

for (const m of manifest) {
  if (m.status === "skip") continue;
  const pc = b64(path.join(PNG, `${m.no}_${m.id}_pc.png`));
  const sp = b64(path.join(PNG, `${m.no}_${m.id}_sp.png`));
  const noteHtml = m.note ? `<p class="note">※ ${m.note}</p>` : "";
  const redir = m.redirected ? `<p class="note">※ 実際には ${m.finalUrl} に移動して表示されます</p>` : "";
  if (!pc && !sp) {
    body += `
<section class="screen">
  <h2><span class="sid">${m.id}</span> ${m.name}</h2>
  <p class="note">この画面は今回のキャプチャでは撮影できませんでした（${m.note || "データなし"}）。実際の操作の中でご確認ください。</p>
</section>`;
    continue;
  }
  body += `
<section class="screen">
  <h2><span class="sid">${m.id}</span> ${m.name}</h2>
  <p class="url">${m.url || ""}</p>
  ${noteHtml}${redir}
  <div class="shots">
    ${pc ? `<figure class="pc"><figcaption>パソコンでの表示</figcaption><div class="imgbox"><img src="${pc}"></div></figure>` : ""}
    ${sp ? `<figure class="sp"><figcaption>スマートフォンでの表示</figcaption><div class="imgbox"><img src="${sp}"></div></figure>` : ""}
  </div>
</section>`;
}

const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Hiragino Sans", "Yu Gothic", sans-serif; color: #222; }
  section { page-break-after: always; padding: 16px 24px; }
  /* 1画面=必ず1ページ: セクション高さをA4の印字領域に固定し、はみ出しを禁止 */
  section.screen { height: 272mm; overflow: hidden; display: flex; flex-direction: column; }
  .cover { display: flex; flex-direction: column; justify-content: center; height: 90vh; gap: 16px; }
  .cover h1 { font-size: 28px; color: #1F4E5F; }
  .cover p { font-size: 13px; line-height: 1.8; }
  .cover .date { color: #777; }
  h2 { font-size: 15px; border-bottom: 2px solid #1F4E5F; padding-bottom: 6px; margin-bottom: 4px; }
  .sid { background: #1F4E5F; color: #fff; padding: 2px 10px; border-radius: 4px; font-size: 13px; margin-right: 8px; }
  .url { font-size: 10px; color: #888; margin-bottom: 6px; word-break: break-all; }
  .note { font-size: 10px; color: #B00; margin-bottom: 6px; }
  /* 画像エリアは残り高さいっぱいを使い、収まらない分は縮小（object-fit: contain） */
  .shots { display: flex; gap: 12px; flex: 1; min-height: 0; align-items: stretch; }
  figure { display: flex; flex-direction: column; min-height: 0; }
  figure.pc { flex: 3; } figure.sp { flex: 1; }
  figcaption { font-size: 10px; color: #555; margin-bottom: 4px; flex: none; }
  .imgbox { flex: 1; min-height: 0; }
  img { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; border: 1px solid #ccc; }
</style></head><body>${body}</body></html>`;

fs.writeFileSync(path.join(OUT, "capture-book.html"), html, "utf8");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file://" + path.join(OUT, "capture-book.html"), { waitUntil: "networkidle" });
await page.pdf({ path: path.join(OUT, "ビジ友_キャプチャ集.pdf"), format: "A4", printBackground: true,
  margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" } });
await browser.close();
console.log("出力: scripts/capture/output/ビジ友_キャプチャ集.pdf");
