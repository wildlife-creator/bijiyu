// NOTE (2026-09-16, P12): 銀行振込の申込テーブル・ADM-025 代理登録・ADM-026 は廃止された。
// このスクリプト内の銀行振込フロー（/admin/bank-transfers/new 等）は当時の記録用で、現行アプリでは動かない。
// 現行の流れは docs/requirements/p12-bank-transfer-onoff-implementation-notes.md を参照。
/**
 * 2026-08〜09 改修（P1〜P11 / クライアント指摘 B / 追加修正 C）の動作確認レポート生成
 *
 * `docs/requirements/changes-summary-202609.md` の項目ごとに、ローカル環境のブラウザを
 * Playwright で実際に操作してスクリーンショットを撮り、「修正内容 / 自動テスト / 画面での確認」
 * をまとめた PDF を作る。
 *
 * 使い方（ローカル。**データを変更するので、実行前に `supabase db reset` すること**）:
 *   supabase start && npm run dev
 *   supabase db reset
 *   CAPTURE_CHROMIUM_PATH=... node scripts/capture/verify-changes-202609.mjs
 *
 * 環境変数:
 *   CAPTURE_BASE_URL       既定 http://localhost:3000
 *   CAPTURE_CHROMIUM_PATH  Playwright 既定ブラウザが無い環境で使う実行ファイル（任意）
 *   CAPTURE_SECTIONS       特定項目のみ: "P1,B" のようにカンマ区切り（任意）
 *   VERIFY_PDF_ONLY        "1" なら撮影せず、既存の manifest.json から PDF だけ作り直す（任意）
 *   VERIFY_EXTRA_DIR       事前に用意したメール HTML・テスト結果を置くディレクトリ（任意）
 *                          mail-render/*.html（テンプレート直接描画）/ tests.json（自動テスト結果）/
 *                          expiry-notify.json（期限通知の実行結果）を読む
 *
 * 出力: scripts/capture/output/verify-202609/（png / manifest.json / report.html / PDF）
 * 失敗したステップは「✗」として残し、その時点の画面も撮る（途中で止めない）。
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const BASE = (process.env.CAPTURE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = "testpass123";
const ONLY = (process.env.CAPTURE_SECTIONS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const OUT = resolve("scripts/capture/output/verify-202609");
const PNG = join(OUT, "png");
const MAIL_DIR = "/tmp/bijiyu-dev-mail";
const EXTRA = process.env.VERIFY_EXTRA_DIR ?? "";
const PDF_NAME = "ビジ友_改修内容の動作確認レポート_202609.pdf";
const RUN_STARTED = Date.now();

const U = {
  contractor: "contractor@test.local",
  contractor2: "contractor2@test.local",
  contractor3: "contractor3@test.local",
  contractor4: "contractor4@test.local",
  client: "client@test.local",
  client2: "client2@test.local",
  staff: "staff@test.local",
  individualClient: "individual-client@test.local",
  bank: "bank-transfer-e2e@test.local",
  downgrade: "downgrade-reserved@test.local",
  ops: "ops-account@test.local",
  admin: "admin@test.local",
};
const ID = {
  contractor: "11111111-1111-1111-1111-111111111111",
  contractor2: "cc111111-1111-1111-1111-111111111111",
  contractor3: "cc222222-2222-2222-2222-222222222222",
  client: "22222222-2222-2222-2222-222222222222",
  client2: "aabbccdd-1111-2222-3333-444455556666",
  bankClient: null, // 実行時に取得
  ops: "0b500000-0000-4000-8000-000000000001",
  withdrawnOwner: "c3331111-1111-1111-1111-111111111111",
  suzukiJob: "66666666-6666-6666-6666-666666666666",
  msgThreadIndiv: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05",
  corpScoutThread: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee08",
  expiredAccepted: "ada00000-0000-4000-8000-000000000005",
  appliedForWithdraw: "dddddddd-dddd-dddd-dddd-dddddddddd08",
};

// ---------------------------------------------------------------------------
// 記録
// ---------------------------------------------------------------------------
const manifest = [];
let seq = 0;
const pad = (n) => String(n).padStart(3, "0");

function psql(sql) {
  return execFileSync("docker", ["exec", "supabase_db_bijiyu", "psql", "-U", "postgres", "-tAc", sql], { encoding: "utf8" }).trim();
}

async function shot(page, sec, title, opts = {}) {
  seq += 1;
  const file = `${pad(seq)}_${sec.id}.png`;
  const path = join(PNG, file);
  try {
    if (opts.target) {
      const loc = opts.target();
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.screenshot({ path });
    } else {
      await page.screenshot({ path, fullPage: opts.fullPage ?? false });
    }
  } catch (err) {
    await page.screenshot({ path, fullPage: false }).catch(() => {});
    if (!opts.status) opts = { ...opts, note: `（部分撮影に失敗したため画面全体を撮影: ${String(err).split("\n")[0].slice(0, 120)}）` };
  }
  manifest.push({
    seq, section: sec.id, title, desc: opts.desc ?? "", status: opts.status ?? "ok", file,
    url: opts.url ?? page.url(), note: opts.note ?? "", error: opts.error ?? "", mobile: opts.mobile ?? false,
  });
}

/** 1 ステップ。fn の中で確認（waitFor / check）し、通れば ✓、例外なら ✗ で記録する */
async function step(page, sec, title, fn, opts = {}) {
  try {
    const note = await fn();
    await page.waitForTimeout(700);
    await shot(page, sec, title, { ...opts, note: typeof note === "string" ? note : opts.note });
    return true;
  } catch (err) {
    const msg = String(err).split("\n")[0].slice(0, 300);
    console.log(`  ✗ ${sec.id} ${title}: ${msg}`);
    await shot(page, sec, title, { ...opts, target: undefined, status: "error", error: msg });
    return false;
  }
}

function check(cond, message) {
  if (!cond) throw new Error(`確認失敗: ${message}`);
}

// ---------------------------------------------------------------------------
// 共通操作
// ---------------------------------------------------------------------------
async function login(page, email) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("textbox", { name: /パスワード/ }).fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/(mypage|admin)/, { timeout: 20000 });
}

async function adminLogin(page) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel("メールアドレス").fill(U.admin);
  await page.getByRole("textbox", { name: /パスワード/ }).fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 20000 });
}

async function newPage(browser, mobile = false) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    locale: "ja-JP",
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  return { ctx, page };
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

/** ローカルのメール出力から、開始時刻以降・件名一致のメールを表示して撮る */
async function shotMails(page, sec, sinceMs, subjectIncludes, title, desc, max = 2) {
  let files = [];
  try {
    files = (await readdir(MAIL_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  const hits = [];
  for (const f of files) {
    try {
      const meta = JSON.parse(await readFile(join(MAIL_DIR, f), "utf8"));
      const sentAt = Date.parse(meta.sentAt ?? "");
      if (!Number.isFinite(sentAt) || sentAt < sinceMs - 2000) continue;
      if (!subjectIncludes.some((s) => String(meta.subject ?? "").includes(s))) continue;
      hits.push({ path: join(MAIL_DIR, f.replace(/\.json$/, ".html")), to: meta.to, subject: meta.subject, sentAt });
    } catch {
      // 壊れた sidecar は無視
    }
  }
  hits.sort((a, b) => a.sentAt - b.sentAt);
  if (hits.length === 0) {
    seq += 1;
    manifest.push({ seq, section: sec.id, title, desc, status: "error", error: `件名「${subjectIncludes.join(" / ")}」のメールが出力されていない`, file: null, url: "" });
    console.log(`  ✗ ${sec.id} ${title}: メールなし`);
    return;
  }
  for (const h of hits.slice(0, max)) {
    await page.goto(`file://${h.path}`);
    await shot(page, sec, `${title}（宛先 ${h.to}）`, { desc: `${desc}\n件名: ${h.subject}`, fullPage: true, url: "ローカルのメール出力（実際に送信処理が走ったメール）" });
  }
}

/** テンプレートを直接描画したメール（VERIFY_EXTRA_DIR/mail-render）を撮る */
async function shotRenderedMail(page, sec, name, title, desc) {
  const path = EXTRA ? join(EXTRA, "mail-render", `${name}.html`) : "";
  if (!path || !existsSync(path)) {
    seq += 1;
    manifest.push({ seq, section: sec.id, title, desc, status: "error", error: `${name}.html が無い`, file: null, url: "" });
    return;
  }
  await page.goto(`file://${path}`);
  await shot(page, sec, title, { desc, fullPage: true, url: "メールテンプレートを直接呼び出して描画（送信はしていない）" });
}

/** DB の確認結果を表にして撮る */
async function shotTable(page, sec, title, desc, sql, headers) {
  const rows = psql(sql).split("\n").filter(Boolean).map((l) => l.split("|"));
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const html = `<html><body style="font:13px sans-serif;padding:16px"><p style="color:#666">DB 確認: ${esc(sql)}</p><table style="border-collapse:collapse">
<tr>${headers.map((h) => `<th style="border:1px solid #ccc;background:#f3eef5;padding:4px 8px;text-align:left">${esc(h)}</th>`).join("")}</tr>
${rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #ccc;padding:4px 8px">${esc(c)}</td>`).join("")}</tr>`).join("")}
</table></body></html>`;
  await page.setContent(html);
  await shot(page, sec, title, { desc, fullPage: true, url: "ローカル DB を直接確認", note: rows.length === 0 ? "（該当行なし）" : "" });
  return rows;
}

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** 運営の代理登録 → 請求書送付済 → 有効化（銀行振込の一連の操作） */
async function bankFlow(page, sec, { email, optionLabel, cycleYearly, labelForTitle }) {
  let detailUrl = "";
  const registeredAt = Date.now();
  await step(page, sec, `運営: 申込を登録する（${labelForTitle}）`, async () => {
    await page.goto(`${BASE}/admin/bank-transfers/new`);
    await page.getByLabel("会員のメールアドレス").fill(email);
    if (optionLabel) {
      await page.getByRole("combobox", { name: "対象" }).click();
      await page.getByRole("option", { name: "オプション" }).click();
      await page.getByRole("combobox", { name: "オプション" }).click();
      await page.getByRole("option", { name: optionLabel }).click();
    }
    if (cycleYearly) {
      await page.getByRole("combobox", { name: "お支払いサイクル" }).click();
      await page.getByRole("option", { name: "年払い" }).click();
    }
    await page.getByText(/金額の目安/).first().waitFor();
  }, { fullPage: true, desc: `操作: 管理画面の「申込を登録する」（ADM-025）で、会員 ${email} の ${labelForTitle} を入力。\n確認: 金額の目安が新価格で表示される。` });
  await step(page, sec, "登録 → 申込詳細（ADM-026）", async () => {
    await page.getByRole("button", { name: "登録する" }).click();
    await page.waitForURL(/\/admin\/bank-transfers\/[0-9a-f-]{36}$/, { timeout: 20000 });
    await page.getByRole("heading", { name: "銀行振込申込詳細" }).waitFor();
    detailUrl = page.url();
  }, { fullPage: true, desc: "操作: 「登録する」。\n確認: 申込詳細に遷移し、状態「申込受付」、本体価格・初回事務手数料・請求合計が表示される。" });
  await step(page, sec, "請求書を送付済みにする", async () => {
    if (detailUrl) await page.goto(detailUrl);
    await page.getByRole("button", { name: "請求書を送付済みにする" }).click();
    await page.getByRole("button", { name: "送付済みにする" }).click();
    await page.getByText("請求書送付済みにしました").waitFor();
  }, { fullPage: true, desc: "操作: 「請求書を送付済みにする」→「送付済みにする」。\n確認: 状態が「請求書送付済」になる。" });
  const since = Date.now();
  await step(page, sec, "入金を確認して有効化する", async () => {
    await page.getByRole("button", { name: "入金を確認して有効化する" }).click();
    const dialog = page.getByRole("dialog", { name: "入金を確認して有効化する" });
    await dialog.getByRole("button", { name: "有効化する" }).click();
    await page.getByText(/有効化しました/).waitFor({ timeout: 20000 });
  }, { fullPage: true, desc: "操作: 「入金を確認して有効化する」→「有効化する」。\n確認: 「有効化しました」が出て状態が「入金確認済」。このとき会員宛・運営宛のメールが送られる。" });
  return { since, registeredAt, detailUrl };
}

// ---------------------------------------------------------------------------
// 項目定義
// ---------------------------------------------------------------------------
const SECTIONS = [
  // =========================================================================
  {
    id: "P1",
    name: "プラン名の変更",
    changes: [
      "個人→ライト、小規模事業者→スタンダード、法人→プレミアム、法人＋サポート→ハイエンドに変更。",
      "プラン名を 1 か所の定数で変更し、料金画面とプラン関連メール 5 種に反映。規約・FAQ に旧プラン名が残っていないことも確認。",
      "会員に表示される「法人プラン」の文言 3 か所を「プレミアム・ハイエンドプラン」に置き換え。",
      "プラン変更メールの件名を分離（期間の終わりに切り替わる変更で、予約した時と実際に切り替わった時を別の件名に）。",
    ],
    tests: [
      "vitest: プラン名の固定（plans.test.ts）、件名分離 5 件（handle-subscription-lifecycle.test.ts / email-templates.test.ts）",
      "E2E: billing.spec.ts（料金プラン画面の表示）",
    ],
    limits: "件名の分離は Stripe の Webhook（期末の自動切り替え）で送られるため、ローカルのブラウザ操作では発生させられない。メールテンプレートを直接描画して件名を確認した。",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await step(page, this, "料金プラン画面の基本プラン（新プラン名）", async () => {
        await login(page, U.client);
        await page.goto(`${BASE}/billing`);
        await page.getByText("ハイエンドプラン").first().waitFor();
        const t = await bodyText(page);
        for (const n of ["ライトプラン", "スタンダードプラン", "プレミアムプラン", "ハイエンドプラン"]) check(t.includes(n), `${n} が表示される`);
        for (const n of ["個人プラン", "小規模事業者", "法人プラン", "法人＋サポート"]) check(!t.includes(n), `旧名「${n}」が無い`);
      }, { fullPage: true, desc: "操作: プレミアム契約中の発注者（client@test.local）で料金プラン画面を開く。\n確認: 4 プランが「ライト / スタンダード / プレミアム / ハイエンド」と表示され、旧名（個人・小規模事業者・法人・法人＋サポート）が画面内に無い（画面の全文を検査）。" });
      await step(page, this, "プラン比較表の見出し", async () => {
        await page.goto(`${BASE}/billing/plans`);
        await page.getByRole("heading", { name: "プラン一覧" }).waitFor();
        const t = await bodyText(page);
        check(!/個人プラン|小規模事業者|法人プラン/.test(t), "旧プラン名が無い");
      }, { target: () => page.locator("table").first(), desc: "操作: プラン比較表（/billing/plans）を開く。\n確認: 列見出しが新プラン名。旧プラン名が画面内に無い。" });
      for (const [path, label] of [["/faq", "よくある質問"], ["/terms", "利用規約"], ["/legal", "特定商取引法に基づく表記"]]) {
        await step(page, this, `${label}に旧プラン名が無い`, async () => {
          await page.goto(`${BASE}${path}`);
          await page.waitForLoadState("networkidle").catch(() => {});
          const t = await bodyText(page);
          const hits = ["個人プラン", "小規模事業者プラン", "法人プラン", "法人＋サポート"].filter((n) => t.includes(n));
          check(hits.length === 0, `旧プラン名が見つかった: ${hits.join(",")}`);
          return `画面全文を検査: 旧プラン名 0 件（本文 ${t.length} 文字）`;
        }, { desc: `操作: ${label}（${path}）を開き、画面の全文から旧プラン名を検索。\n確認: 「個人プラン / 小規模事業者プラン / 法人プラン / 法人＋サポート」が 0 件。` });
      }
      await step(page, this, "退会の警告ダイアログ（プレミアム・ハイエンドの Owner）", async () => {
        await page.goto(`${BASE}/profile/withdrawal`);
        await page.getByText("お選びください").click();
        await page.getByRole("option").first().click();
        await page.getByLabel("上記内容に同意して退会する").check();
        await page.getByRole("button", { name: "退会する" }).click();
        const dialog = page.getByRole("alertdialog");
        await dialog.waitFor();
        const t = await dialog.innerText();
        check(t.includes("プレミアムまたはハイエンドプラン"), "新しい呼び方で案内される");
        check(!t.includes("法人プラン"), "「法人プラン」が無い");
      }, { target: () => page.getByRole("alertdialog"), desc: "操作: 法人 Owner で退会手続き画面を開き、理由と同意を入れて「退会する」（確定はしない）。\n確認: 警告ダイアログの案内が「プレミアムまたはハイエンドプラン」で、旧「法人プラン」の語が無い。" });
      await page.keyboard.press("Escape");
      await shotRenderedMail(page, this, "p1-downgrade-reserved", "メール: ダウングレードを予約した時",
        "Webhook がダウングレード予約を検知したときに送るメール。\n確認: 件名「【ビジ友】プラン変更を承りました」。");
      await shotRenderedMail(page, this, "p1-downgrade-applied", "メール: 期末に実際に切り替わった時（新設）",
        "予約していた変更が期末に適用されたときのメール（P1 で追加）。\n確認: 件名が「【ビジ友】プラン変更が完了しました」で、予約時と区別できる。");
      await ctx.close();
    },
  },
  // =========================================================================
  {
    id: "P2",
    name: "銀行振込の追加",
    changes: [
      "銀行振込での申込・入金確認・有効化の仕組みを新設（月払い・年払い・オプションのすべてに対応）。",
      "申込時のメール 2 種を新設（申込者宛の控え、運営宛の請求書送付依頼）。",
      "管理画面に銀行振込の一覧・詳細・有効化・プラン変更・解約・期限延長を追加。",
      "「期限間近」「期限切れ」のバッジを一覧に表示。",
      "期限 30 日前と当日に運営へ通知メールを送る定期処理を追加。",
      "銀行振込の会員が、カード決済前提の処理（プラン変更・解約・未払い自動解約）に流れ込まないよう分離。",
    ],
    tests: [
      "vitest: 銀行振込の申込・有効化・金額計算・Stripe 前提処理のガードなど +64 件",
      "pgTAP: bank_transfer_requests の RLS・二重申込防止 17 件",
      "E2E: bank-transfer.spec.ts（代理登録 → 請求書送付済 → 有効化 → 会員側ご利用中、期限延長、期限間近バッジ）",
    ],
    limits: "運営宛「請求書を送付してください」メールは会員本人の申込（P9 で既定は非表示）でのみ送られるため、テンプレートを直接描画して確認した。期限通知の定期処理は、DB の期限日を当日・30 日後に一時的に書き換え、ローカルで処理を直接呼び出した結果を載せた（送信キーを渡さず、送信せずにログへ出す動作で確認し、期限日は元に戻した）。",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await adminLogin(page);
      await step(page, this, "銀行振込申込一覧（ADM-025）", async () => {
        await page.goto(`${BASE}/admin/bank-transfers`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      }, { fullPage: true, desc: "操作: 管理画面の銀行振込申込一覧を開く。\n確認: 申込が状態つきで一覧表示され、「申込を登録する」ボタンがある。" });
      const { registeredAt } = await bankFlow(page, this, { email: U.bank, cycleYearly: true, labelForTitle: "ライトプラン・年払い" });
      await shotMails(page, this, registeredAt, ["銀行振込でのお申し込みを受け付けました"], "メール: 申込者宛の控え（新設）",
        "申込を登録した時点で会員へ送られる控え。\n確認: お申し込み内容と「請求書をお送りします」の案内。", 1);
      await shotRenderedMail(page, this, "p2-bank-requested-ops", "メール: 運営宛の請求書送付依頼（新設）",
        "会員本人が申し込んだときに運営へ送られるメール（テンプレートを直接描画）。\n確認: 件名「請求書を送付してください」、申込者・対象・本体価格・初回事務手数料・合計・管理画面へのリンク。");
      await step(page, this, "会員側: 料金プラン画面（銀行振込で契約中）", async () => {
        await login(page, U.bank);
        await page.goto(`${BASE}/billing`);
        await page.getByText("ご利用中").first().waitFor();
        const t = await bodyText(page);
        check(t.includes("銀行振込"), "銀行振込の表示がある");
        check((await page.getByRole("button", { name: "お支払い情報を管理する" }).count()) === 0, "カード決済用の「お支払い情報を管理する」が出ない");
      }, { fullPage: true, desc: "操作: 有効化された会員でログインし、料金プラン画面を開く。\n確認: 「ご利用中」「銀行振込（年払い）」と有効期限。カード決済前提の「お支払い情報を管理する」やプラン変更・解約ボタンが出ない（Stripe 前提処理との分離）。" });
      await adminLogin(page);
      const bankClientId = psql("select id from users where email='bank-client@test.local'");
      await step(page, this, "発注者一覧の「期限間近」バッジ（ADM-003）", async () => {
        await page.goto(`${BASE}/admin/clients?q=bank-client`);
        await page.getByText("期限間近").first().waitFor();
      }, { fullPage: true, desc: "操作: 発注者一覧で、期限が 30 日以内の銀行振込会員（bank-client@test.local、期限は 10 日後）を表示。\n確認: 行に「期限間近」バッジが出る。" });
      await step(page, this, "発注者一覧の「期限切れ」バッジ（期限日を過去に書き換えて確認）", async () => {
        psql(`update subscriptions set current_period_end = now() - interval '2 days' where user_id=(select id from users where email='${U.bank}') and payment_method='bank_transfer'`);
        await page.goto(`${BASE}/admin/clients?q=bank-transfer-e2e`);
        await page.getByText("期限切れ").first().waitFor();
      }, { fullPage: true, desc: "操作: 先ほど有効化した会員（振込一郎）の期限日を DB で 2 日前に書き換え、発注者一覧を表示。\n確認: 行に「期限切れ」バッジが出る（自動停止はしない設計）。" });
      await step(page, this, "発注者詳細の銀行振込パネル（ADM-004）", async () => {
        await page.goto(`${BASE}/admin/clients/${bankClientId}`);
        await page.getByRole("button", { name: /期限を延長/ }).first().waitFor();
        const t = await bodyText(page);
        check(t.includes("プラン変更") || t.includes("プランを変更"), "プラン変更の操作がある");
        check(t.includes("解約"), "解約の操作がある");
      }, { fullPage: true, desc: "操作: 銀行振込で契約中の発注者の詳細を開く。\n確認: 銀行振込の契約に対する「プラン変更」「期限を延長」「解約」の操作が並ぶ（カード決済の会員には出ない運営用パネル）。" });
      // 期限通知の定期処理
      const expiryPath = EXTRA ? join(EXTRA, "expiry-notify.json") : "";
      if (expiryPath && existsSync(expiryPath)) {
        const r = JSON.parse(await readFile(expiryPath, "utf8"));
        await page.setContent(`<html><body style="font:13px sans-serif;padding:16px"><h3>期限通知の定期処理（bank-transfer-expiry-notify）の実行結果</h3><pre style="white-space:pre-wrap;background:#f6f2f8;padding:12px">${String(r.log).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</pre>${r.html ?? ""}</body></html>`);
        await shot(page, this, "期限通知の定期処理（当日・30 日前）", { fullPage: true, status: r.ok ? "ok" : "error", error: r.ok ? "" : r.error, url: "ローカルで処理を直接呼び出した結果", desc: "操作: DB で銀行振込契約の期限日を「本日」と「30 日後」に書き換え、定期処理を直接呼び出す。\n確認: 運営宛メールの件名に「本日 N 件 / 30 日後 N 件」が入り、対象者が列挙される。" });
      }
      await ctx.close();
    },
  },
  // =========================================================================
  {
    id: "P3",
    name: "年払いとプラン変更画面",
    changes: [
      "年払いを追加（4 プラン分の年額を新設。月払い／年払いの切替 UI を追加）。",
      "月払い→年払いは即時切替、年払い→月払いは期間終了時に切替のルールを実装。",
      "アップグレードを、決済サービス（Stripe）の確認画面を経由する方式に変更。",
      "年払いの暫定金額を「月額 × 10 か月分」に設定。",
    ],
    tests: [
      "vitest: 年額 Price の解決・サイクル切替の判定（comparePlanChange）など +8 件、暫定金額 ×10",
      "E2E: billing.spec.ts「年払いに切り替えると年額の申込ボタンに変わる」",
    ],
    limits: "Stripe の確認画面への遷移と決済の確定は Stripe のテスト環境が必要なため、確認ダイアログ（「Stripe の確認画面に移動」の案内）までを画面で確認した。",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await login(page, U.contractor);
      await step(page, this, "月払いの表示（無料会員）", async () => {
        await page.goto(`${BASE}/billing`);
        await page.getByRole("tab", { name: "月払い" }).waitFor();
      }, { fullPage: true, desc: "操作: 無料会員で料金プラン画面を開く。\n確認: 「月払い / 年払い」の切替タブがあり、月額が表示される。" });
      await step(page, this, "年払いに切り替え（年額 = 月額 × 10）", async () => {
        await page.getByRole("tab", { name: "年払い" }).click();
        await page.waitForTimeout(400);
        const t = await bodyText(page);
        for (const p of ["28,000", "98,000", "280,000", "1,680,000"]) check(t.includes(p), `年額 ${p} 円が表示される`);
      }, { fullPage: true, desc: "操作: 「年払い」タブを押す。\n確認: 年額が 28,000 / 98,000 / 280,000 / 1,680,000 円（月額 × 10 の暫定）で表示される。" });
      await login(page, U.client);
      await step(page, this, "契約中の会員: 切替ルールの案内", async () => {
        await page.goto(`${BASE}/billing`);
        await page.getByText(/月払い → 年払いは即時、年払い → 月払いは次回更新日に切り替わります/).waitFor();
      }, { target: () => page.getByText(/月払い → 年払いは即時/).locator(".."), desc: "操作: プレミアム月払いで契約中の発注者で料金プラン画面を開く。\n確認: 「月払い → 年払いは即時、年払い → 月払いは次回更新日に切り替わります」の案内。" });
      await step(page, this, "年払いへの変更 → Stripe の確認画面を経由する案内", async () => {
        await page.getByRole("tab", { name: "年払い" }).click();
        await page.getByText("プレミアムプラン", { exact: true }).last().locator("xpath=following::button[1]").click();
        const dialog = page.getByRole("dialog");
        await dialog.getByText("プラン変更の確認").waitFor();
        check((await dialog.innerText()).includes("Stripe の確認画面に移動"), "Stripe の確認画面を経由する案内がある");
      }, { target: () => page.getByRole("dialog"), desc: "操作: 年払いタブで「このプランに変更する」を押す（確定はしない）。\n確認: 「このあと Stripe の確認画面に移動し、日割りの差額と次回請求額を確認してから確定できます」の確認ダイアログ。" });
      await page.keyboard.press("Escape");
      await login(page, U.downgrade);
      await step(page, this, "期間終了時に切り替わる変更の予約表示", async () => {
        await page.goto(`${BASE}/billing`);
        await page.getByText(/変更予定|予約/).first().waitFor();
      }, { fullPage: true, desc: "操作: ダウングレードを予約中の会員（downgrade-reserved@test.local）で料金プラン画面を開く。\n確認: 変更予定（期間終了後に切り替わる）が表示され、「変更をキャンセルする」ボタンがある。" });
      await ctx.close();
    },
  },
  // =========================================================================
  {
    id: "P4",
    name: "動画基盤（MP4 アップロード）",
    changes: [
      "動画を管理する専用テーブルを新設（1 ユーザー複数本・表示順つき）。",
      "管理画面から MP4 を直接アップロードできるようにした（Cloudflare Stream 連携、200MB まで）。",
      "掲載場所（ユーザー詳細ページ／発注者詳細ページ）を管理側で選べるようにした。",
      "動画枠を全ユーザーに解放（オプション購入の有無で出し分けない）。",
      "動画に「処理中／公開」の状態表示を付け、公開に切り替わらないときに「状態を確認」を押せるようにした。",
      "動画が初めて公開されたときだけ、会員に「動画を掲載しました」メールを送る。",
      "管理画面の発注者情報に、カード払いの会員でも「月払い／年払い」を表示するようにした。",
      "動画の登録・並び替え・削除に監査ログを追加。",
    ],
    tests: [
      "vitest: 動画の表示・登録・削除・Webhook・掲載メールの判定",
      "pgTAP: videos_rls（公開中のみ閲覧可、書き込みは運営のみ）",
      "E2E: video-display.spec.ts（表示・ADM-027 の追加 / 並び替え / 削除）",
    ],
    limits: "実際の MP4 アップロードは Cloudflare の本番アカウントに送信されるため行わず、アップロード欄が有効になっていることまでを確認した。URL 登録で「公開」→ 掲載メールまでを通した。",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await adminLogin(page);
      const since = Date.now();
      await step(page, this, "動画管理（ADM-027）: 掲載場所タブと MP4 アップロード欄", async () => {
        await page.goto(`${BASE}/admin/users/${ID.contractor3}`);
        await page.getByRole("link", { name: "動画を投稿/編集する" }).click();
        await page.waitForURL(/\/videos\?placement=contractor_page/);
        await page.getByText("ファイルをアップロード（MP4）").waitFor();
        check((await bodyText(page)).includes("200MB"), "200MB の上限が案内される");
      }, { fullPage: true, desc: "操作: 管理画面のユーザー詳細（渡辺大輔）から「動画を投稿/編集する」。\n確認: 掲載場所のタブ（ユーザープロフィール / 発注者情報詳細）、MP4 のドラッグ＆ドロップ欄（MP4・200MB 以下）、URL 追加欄がある。" });
      await step(page, this, "URL で追加 → 「公開」になる（0 本 → 1 本）", async () => {
        const tab = page.getByRole("tabpanel");
        await tab.getByLabel("URL").fill("https://www.tiktok.com/@bijiyu/video/7999999999999999997");
        await tab.getByLabel("管理用ラベル（任意）").last().fill("確認用 動画");
        await tab.getByRole("button", { name: "URL で追加" }).click();
        await page.getByText("動画を追加しました").waitFor({ timeout: 20000 });
        await page.getByText("登録済みの動画（1本）").waitFor();
      }, { fullPage: true, desc: "操作: TikTok の URL と管理用ラベルを入れて「URL で追加」。\n確認: 「動画を追加しました」、登録済み 1 本、状態「公開」。" });
      await shotMails(page, this, since, ["動画の掲載が完了しました"], "メール: 動画の掲載が完了しました（その掲載先で初めて公開されたとき）",
        "0 本 → 1 本になったときだけ会員へ送られるメール。\n確認: 件名「【ビジ友】動画の掲載が完了しました」、【掲載先】ユーザー詳細ページ。", 1);
      await step(page, this, "処理中の動画と「状態を確認」ボタン", async () => {
        await page.goto(`${BASE}/admin/users/${ID.client2}/videos?placement=client_page`);
        await page.getByText("処理中").first().waitFor();
        await page.getByRole("button", { name: /状態を確認/ }).first().waitFor();
      }, { fullPage: true, desc: "操作: Cloudflare で処理中の動画を持つ発注者（client2）の動画管理を、発注者情報詳細タブで開く。\n確認: 「処理中」バッジと「状態を確認」ボタンが出る（押すと Cloudflare に問い合わせて公開に切り替える）。" });
      await shotTable(page, this, "監査ログ（動画の登録）",
        "DB の監査ログ（audit_logs）を確認。\n確認: 先ほどの URL 追加が video_create として記録されている。",
        "select action, created_at::timestamp(0), metadata->>'placement' from audit_logs where action like 'video_%' order by created_at desc limit 5",
        ["操作", "日時", "掲載場所"]);
      await login(page, U.client);
      await step(page, this, "会員側: オプション未購入でも動画が表示される", async () => {
        const opt = psql(`select count(*) from option_subscriptions where user_id='${ID.contractor3}'`);
        await page.goto(`${BASE}/users/contractors/${ID.contractor3}`);
        await page.getByRole("heading", { name: "プロフィール動画" }).waitFor();
        return `渡辺大輔の動画オプション購入履歴: ${opt} 件`;
      }, { fullPage: true, desc: "操作: 発注者でログインし、渡辺大輔（動画オプション未購入）のユーザー詳細を開く。\n確認: 「プロフィール動画」欄に登録した動画が出る（購入の有無で出し分けない）。" });
      await adminLogin(page);
      await step(page, this, "発注者詳細: カード払いでも「月払い／年払い」を表示（ADM-004）", async () => {
        await page.goto(`${BASE}/admin/clients/${ID.client}`);
        await page.getByText(/クレジットカード・月払い/).first().waitFor();
      }, { target: () => page.getByText(/クレジットカード・月払い/).first().locator("../.."), desc: "操作: カード払いの発注者（鈴木工務店）の発注者アカウント詳細を開く。\n確認: 「プラン: プレミアム（クレジットカード・月払い）」と支払方法・サイクルが併記される。" });
      await step(page, this, "動画を削除", async () => {
        await page.goto(`${BASE}/admin/users/${ID.contractor3}/videos?placement=contractor_page`);
        await page.getByRole("button", { name: "確認用 動画を削除" }).click();
        await page.getByRole("button", { name: "削除する" }).click();
        await page.getByText("動画を削除しました").waitFor({ timeout: 20000 });
      }, { fullPage: true, desc: "操作: 追加した動画の「削除」→「削除する」。\n確認: 「動画を削除しました」、登録済み 0 本。" });
      await shotTable(page, this, "監査ログ（動画の登録・削除）",
        "確認: 削除も video_delete として記録される。",
        "select action, created_at::timestamp(0) from audit_logs where action like 'video_%' order by created_at desc limit 5",
        ["操作", "日時"]);
      await ctx.close();
    },
  },
  // =========================================================================
  {
    id: "P5",
    name: "管理運営アカウント",
    changes: [
      "運営用の会員アカウントを作れるようにした（ハイエンド相当、支払いなし）。",
      "このアカウントを職人一覧・発注者一覧・検索・マイリスト等から除外。",
      "運営アカウントから、職人詳細・発注者詳細の「メッセージを送る」で会員にメッセージを始められるようにした。",
      "法人アカウント同士のメッセージが正しく使えるようにした（従来はスレッドは見えるのに本文が読めず、返信もできなかった）。",
      "管理画面のユーザー一覧・発注者一覧・各詳細に「管理運営」バッジを表示。",
      "退会済みの相手や自分自身に、新しくメッセージを始められないようにした。",
    ],
    tests: [
      "vitest: 運営アカウント設定 Action・新規スレッドのガード・除外クエリ 10 件",
      "pgTAP: is_hidden 列・messages の RLS（法人同士）9 件",
      "E2E: ops-account.spec.ts 12 件（一覧から除外、直リンク 404、運営 → 発注者・職人へ送信、相手と担当者が読んで返信）",
    ],
    limits: "",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await login(page, U.contractor);
      await step(page, this, "発注者一覧に運営アカウントが出ない", async () => {
        await page.goto(`${BASE}/clients`);
        await page.getByLabel("並び替え").waitFor();
        check((await page.getByText("ビジ友運営（テスト）").count()) === 0, "運営アカウントが一覧に無い");
        return `DB 上の運営アカウント: ${psql(`select coalesce(display_name,'') from client_profiles where user_id='${ID.ops}'`)}（list_plan_rank=${psql(`select list_plan_rank from users where id='${ID.ops}'`)} = ハイエンド相当だが表示されない）`;
      }, { fullPage: true, desc: "操作: 職人で発注者一覧（おすすめ順 = 上位プランが先頭）を開く。\n確認: ハイエンド相当の運営アカウント「ビジ友運営（テスト）」が一覧に出ない。" });
      await step(page, this, "運営アカウントの発注者詳細は直リンクでも 404", async () => {
        const res = await page.goto(`${BASE}/clients/${ID.ops}`);
        check(res?.status() === 404, `404 になる（実際: ${res?.status()}）`);
      }, { desc: "操作: 運営アカウントの発注者詳細 URL を直接開く。\n確認: 404（ページが見つかりません）。" });
      await login(page, U.ops);
      const sinceMsg = Date.now();
      const text = `運営からのご案内（動作確認 ${new Date().toLocaleTimeString("ja-JP")}）`;
      await step(page, this, "運営: 発注者詳細の「メッセージを送る」から送信", async () => {
        await page.goto(`${BASE}/clients/${ID.client}`);
        await page.getByRole("link", { name: "メッセージを送る" }).first().click();
        const input = page.locator("textarea[placeholder='メッセージ']");
        await input.waitFor({ timeout: 20000 });
        await input.fill(text);
        const res = page.waitForResponse((r) => r.request().method() === "POST" && /\/messages\//.test(r.url()));
        await page.locator("button.rounded-full.bg-primary").last().click();
        const body = await (await res).text();
        check(!body.includes('"success":false'), "送信が成功する");
        await page.getByText(text).first().waitFor();
      }, { desc: "操作: 運営アカウントでログインし、鈴木工務店の発注者詳細で「メッセージを送る」→ 本文を入力して送信。\n確認: スレッドが作られ、自分側の吹き出しに本文が出る。" });
      await login(page, U.staff);
      await step(page, this, "発注者の担当者（法人同士のスレッド）: 本文を読める", async () => {
        await page.goto(`${BASE}/messages`);
        await page.getByRole("link", { name: /ビジ友運営（テスト）/ }).first().click();
        await page.getByText(text).first().waitFor({ timeout: 20000 });
      }, { desc: "操作: 鈴木工務店の担当者（staff@test.local）でログインし、メッセージ一覧から運営とのスレッドを開く。\n確認: 運営が送った本文が読める（運営も法人扱いのため、法人同士のスレッド。以前は本文が読めなかった）。" });
      await step(page, this, "担当者から返信できる", async () => {
        const reply = `担当者から返信（${new Date().toLocaleTimeString("ja-JP")}）`;
        await page.locator("textarea[placeholder='メッセージ']").fill(reply);
        const res = page.waitForResponse((r) => r.request().method() === "POST" && /\/messages\//.test(r.url()));
        await page.locator("button.rounded-full.bg-primary").last().click();
        const body = await (await res).text();
        check(!body.includes('"success":false'), "返信が成功する");
        await page.getByText(reply).first().waitFor();
      }, { desc: "操作: 担当者が返信を送る。\n確認: 送信が成功し、吹き出しが出る。" });
      await login(page, U.client);
      await step(page, this, "自分自身には新しいメッセージを始められない", async () => {
        const res = await page.goto(`${BASE}/messages/new?to=${ID.client}`);
        check(res?.status() === 404, `自分宛の新規スレッドは 404（実際: ${res?.status()}）`);
      }, { desc: "操作: 鈴木花子でログインし、自分宛の新規メッセージ URL（/messages/new?to=自分）を直接開く。\n確認: 404 になりスレッドは作られない。" });
      await step(page, this, "退会済みの相手には新しいメッセージを始められない", async () => {
        const res = await page.goto(`${BASE}/messages/new?to=${ID.withdrawnOwner}`);
        check(res?.status() === 404, `退会済みの相手は 404（実際: ${res?.status()}）`);
      }, { desc: "操作: 退会済みユーザー（withdrawn-owner@test.local）宛の新規メッセージ URL を直接開く。\n確認: 404 になりスレッドは作られない。" });
      await adminLogin(page);
      await step(page, this, "管理画面: ユーザー一覧の「管理運営」バッジ（ADM-008）", async () => {
        await page.goto(`${BASE}/admin/users?q=ops-account`);
        await page.getByText("管理運営").first().waitFor();
      }, { fullPage: true, desc: "操作: 管理画面のユーザー一覧で運営アカウントを検索。\n確認: 行に「管理運営」バッジ。" });
      await step(page, this, "管理画面: 発注者一覧の「管理運営」バッジ（ADM-003）", async () => {
        await page.goto(`${BASE}/admin/clients?q=ops-account`);
        await page.getByText("管理運営").first().waitFor();
      }, { fullPage: true, desc: "操作: 発注者一覧で運営アカウントを検索。\n確認: 行に「管理運営」バッジ。" });
      await step(page, this, "管理画面: ユーザー詳細の設定パネルとバッジ（ADM-009）", async () => {
        await page.goto(`${BASE}/admin/users/${ID.ops}`);
        await page.getByText("管理運営").first().waitFor();
        await page.getByRole("button", { name: /管理運営アカウント.*解除/ }).first().waitFor();
      }, { fullPage: true, desc: "操作: 運営アカウントのユーザー詳細を開く。\n確認: 見出しに「管理運営」バッジ、「管理運営アカウントを解除する」の設定パネル（通常の会員では「設定する」）。" });
      await ctx.close();
    },
  },
  // =========================================================================
  {
    id: "P6",
    name: "一覧の並び順",
    changes: [
      "発注者一覧と案件一覧の「おすすめ順」で、上位プランが先に表示されるようにした。",
      "並べ替えの UI を、リンク切替式からプルダウン選択式に統一（会員向けの一覧。メッセージ一覧と管理画面の一覧は対象外）。",
      "発注者一覧・職人一覧・募集現場一覧に、並び替え機能そのものを新しく追加した。",
      "応募一覧で並び替えを押すと、他の検索条件が消えてしまう不具合を修正した。",
    ],
    tests: [
      "pgTAP: list_plan_rank（契約の変化にランクが追従）17 件",
      "vitest: sort-options.test.ts（未知の値は既定に倒す等）",
      "E2E: list-sorting.spec.ts（9 画面の並び替え、条件の保持、ページ番号のリセット）",
    ],
    limits: "",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await login(page, U.contractor);
      await step(page, this, "発注者一覧（おすすめ順 = 上位プランが先頭）", async () => {
        await page.goto(`${BASE}/clients`);
        await page.getByText("ハイエンド建設株式会社").first().waitFor();
      }, { fullPage: true, desc: "操作: 職人で発注者一覧（CON-005）を開く（既定 = おすすめ順）。\n確認: 先頭がハイエンドの「ハイエンド建設株式会社」、続いてプレミアム → スタンダード → その他。" });
      await step(page, this, "発注者一覧の並び替えプルダウン（新設）", async () => {
        await page.getByLabel("並び替え").click();
        await page.getByRole("option", { name: "新着順" }).waitFor();
      }, { desc: "操作: 「並び替え」プルダウンを開く。\n確認: 「おすすめ順 / 新着順」の選択肢（以前は並び替え自体が無かった）。" });
      await page.keyboard.press("Escape");
      await step(page, this, "案件一覧（おすすめ順 = 急募 → 上位プラン）", async () => {
        await page.goto(`${BASE}/jobs/search`);
        await page.getByLabel("並び替え").waitFor();
        await page.getByText("ハイエンド急募 那覇市 外壁塗装工事").first().waitFor();
      }, { fullPage: true, desc: "操作: 募集案件一覧（CON-002）を開く。\n確認: 既定がおすすめ順で、急募かつハイエンドの案件が先頭。並び替えはプルダウン。" });
      await login(page, U.client);
      await step(page, this, "職人一覧の並び替え（新設）", async () => {
        await page.goto(`${BASE}/users/contractors`);
        await page.getByLabel("並び替え").click();
        await page.getByRole("option", { name: "登録が古い順" }).waitFor();
      }, { desc: "操作: 発注者で職人一覧（CLI-005）を開き、並び替えを開く。\n確認: 「新着順 / 登録が古い順」（以前は並び替えが無かった）。" });
      await page.keyboard.press("Escape");
      await step(page, this, "募集現場一覧の並び替え（新設）", async () => {
        await page.goto(`${BASE}/jobs/manage`);
        await page.getByLabel("並び替え").click();
        await page.getByRole("option", { name: "古い順" }).waitFor();
      }, { desc: "操作: 募集現場一覧（CLI-001）を開き、並び替えを開く。\n確認: 「新着順 / 古い順」（以前は押せない飾りのアイコンだった）。" });
      await page.keyboard.press("Escape");
      await step(page, this, "応募一覧: 案件で絞り込んだまま並び替えても条件が消えない", async () => {
        await page.goto(`${BASE}/applications/received?jobId=${ID.suzukiJob}`);
        await page.getByLabel("並び替え").click();
        await page.getByRole("option", { name: "古い順" }).click();
        await page.waitForURL(/sort=/);
        const url = page.url();
        check(url.includes(`jobId=${ID.suzukiJob}`), "jobId が URL に残る");
        return `並び替え後の URL: ${url.replace(BASE, "")}`;
      }, { fullPage: true, desc: "操作: 応募一覧（CLI-007）を案件で絞り込んだ状態で開き、並び替えを「古い順」に変更。\n確認: URL に案件の絞り込み（jobId）が残ったまま sort が付く（以前は jobId 以外の条件が消えていた）。" });
      await ctx.close();
    },
  },
  // =========================================================================
  {
    id: "P7",
    name: "ユーザー撮影動画制作プラン",
    changes: ["新オプション「ユーザー撮影動画制作プラン」（20,000 円）を追加。カード決済と銀行振込の両方に対応。"],
    tests: [
      "vitest: Checkout / Webhook / 銀行振込申込 / ADM-026 有効化 / 金額",
      "pgTAP: bank_transfer_video_shooting（銀行振込申込の制約）",
      "E2E: billing.spec.ts（表示）、bank-transfer.spec.ts（代理登録 → 有効化 → 購入済み）",
    ],
    limits: "カード決済は Stripe のテスト環境が必要なため、購入ボタンの表示までを確認した。銀行振込側は代理登録の選択肢で確認した。",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await login(page, U.contractor);
      await step(page, this, "料金プラン画面のユーザー撮影動画制作プラン", async () => {
        await page.goto(`${BASE}/billing`);
        await page.getByText("ユーザー撮影動画制作プラン").first().waitFor();
        check((await bodyText(page)).includes("20,000"), "20,000 円が表示される");
      }, { target: () => page.getByText("ユーザー撮影動画制作プラン").first().locator("xpath=ancestor::*[self::div or self::section][3]"), desc: "操作: 料金プラン画面のオプション欄を見る。\n確認: 「ユーザー撮影動画制作プラン」20,000 円と申込ボタン。" });
      await adminLogin(page);
      await step(page, this, "銀行振込の代理登録でも選べる", async () => {
        await page.goto(`${BASE}/admin/bank-transfers/new`);
        await page.getByRole("combobox", { name: "対象" }).click();
        await page.getByRole("option", { name: "オプション" }).click();
        await page.getByRole("combobox", { name: "オプション" }).click();
        await page.getByRole("option", { name: /ユーザー撮影動画制作プラン/ }).waitFor();
      }, { desc: "操作: 管理画面の「申込を登録する」で対象を「オプション」にし、オプションのプルダウンを開く。\n確認: 選択肢に「ユーザー撮影動画制作プラン」がある。" });
      await ctx.close();
    },
  },
  // =========================================================================
  {
    id: "P8",
    name: "補償オプションの取り下げ",
    changes: [
      "補償オプションを画面から非表示にした（コードは残し、設定で切り替え可能）。",
      "お問い合わせに「報酬未払いについて」を追加（未払いが起きる前の相談窓口）。",
      "トラブル報告に「報酬未払い」を追加（起きた後の窓口）。",
      "アプリ内の「給与」の表現を「報酬」に統一（お問い合わせ・トラブル報告の選択肢、料金画面、補償メール）。",
    ],
    tests: [
      "vitest: 販売停止時の申込拒否（Checkout・銀行振込）、新しい選択肢の検証",
      "E2E: billing.spec.ts（補償の行が出ない）、support.spec.ts（新しい選択肢で送信）",
    ],
    limits: "",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await login(page, U.contractor);
      await step(page, this, "料金プラン画面に補償オプションが無い", async () => {
        await page.goto(`${BASE}/billing`);
        await page.getByText("オプションプラン").first().waitFor();
        const t = await bodyText(page);
        check(!t.includes("補償"), "「補償」の行が無い");
        check(!t.includes("給与"), "「給与」の表現が無い");
      }, { fullPage: true, desc: "操作: 料金プラン画面を開き、全文を検査。\n確認: 「補償」の行が無い。「給与」の語も無い。" });
      await step(page, this, "お問い合わせ: 「報酬未払いについて」", async () => {
        await page.goto(`${BASE}/contact`);
        await page.locator("#inquiryType").click();
        const opt = page.getByRole("option", { name: "報酬未払いについて" });
        await opt.waitFor();
        await opt.scrollIntoViewIfNeeded();
        await opt.hover();
      }, { desc: "操作: お問い合わせ（/contact）のお問い合わせ内容プルダウンを開く。\n確認: 「報酬未払いについて」がある。" });
      await page.keyboard.press("Escape");
      await step(page, this, "トラブル報告: 「報酬未払い」", async () => {
        await page.goto(`${BASE}/trouble-report`);
        await page.getByRole("combobox").filter({ hasText: /選択/ }).first().click();
        const opt = page.getByRole("option", { name: "報酬未払い", exact: true });
        await opt.waitFor();
        await opt.scrollIntoViewIfNeeded();
        await opt.hover();
      }, { desc: "操作: ログイン中にトラブル報告（/trouble-report）の種類プルダウンを開く。\n確認: 「報酬未払い」がある。" });
      await ctx.close();
    },
  },
  // =========================================================================
  {
    id: "P9",
    name: "銀行振込の本人申込を非表示に",
    changes: [
      "料金プラン画面の「銀行振込で申し込む」ボタンを既定で非表示にし、お問い合わせ案内に変更。",
      "運営が管理画面から代理で申込を登録できる画面を新設。",
      "お問い合わせの内容に「お支払い方法（銀行振込）について」を追加。",
      "よくある質問 Q17（支払い方法）を改訂し、特定商取引法ページの支払方法・支払時期にも銀行振込を追記。",
    ],
    tests: [
      "vitest: フラグ未設定時の本人申込の拒否、代理登録 7 件、法務ページ本文の一字一句一致",
      "E2E: bank-transfer.spec.ts（代理登録起点）、billing.spec.ts（案内文）",
    ],
    limits: "代理登録から有効化までの一連の操作は P2 の項目で実施した。",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await login(page, U.contractor);
      await step(page, this, "料金プラン画面: 本人申込ボタンが無く、お問い合わせ案内", async () => {
        await page.goto(`${BASE}/billing`);
        await page.getByText(/銀行振込をご希望の方は/).first().waitFor();
        check((await page.getByRole("button", { name: "銀行振込で申し込む" }).count()) === 0, "「銀行振込で申し込む」ボタンが無い");
      }, { target: () => page.getByText(/銀行振込をご希望の方は/).first().locator(".."), desc: "操作: 無料会員で料金プラン画面を開く。\n確認: 「銀行振込で申し込む」ボタンが無く、「銀行振込をご希望の方は お問い合わせ ください」の案内がある。" });
      await step(page, this, "お問い合わせ: 「お支払い方法（銀行振込）について」", async () => {
        await page.goto(`${BASE}/contact`);
        await page.locator("#inquiryType").click();
        const opt = page.getByRole("option", { name: "お支払い方法（銀行振込）について" });
        await opt.waitFor();
        await opt.hover();
      }, { desc: "操作: お問い合わせ内容のプルダウンを開く。\n確認: 「お支払い方法（銀行振込）について」がある。" });
      await page.keyboard.press("Escape");
      await step(page, this, "よくある質問 Q17", async () => {
        await page.goto(`${BASE}/faq`);
        await page.getByText("Q17. 有料プランの支払い方法は。").click().catch(() => {});
        await page.getByText(/銀行振込に対応しています/).first().waitFor();
      }, { target: () => page.getByText("Q17. 有料プランの支払い方法は。").locator("xpath=ancestor::*[2]"), desc: "操作: よくある質問を開き Q17 を表示。\n確認: 「クレジットカード決済と、銀行振込に対応しています。…銀行振込をご希望の場合は、お問い合わせ窓口までご連絡ください」。" });
      await step(page, this, "特定商取引法に基づく表記: 支払方法・支払時期", async () => {
        await page.goto(`${BASE}/legal`);
        await page.getByText(/銀行振込をご希望の場合はお問い合わせください/).first().waitFor();
        await page.getByText(/請求書に記載の期日までにお振込みください/).first().waitFor();
      }, { target: () => page.getByText("支払方法", { exact: true }).first().locator("xpath=ancestor::*[3]"), desc: "操作: 特定商取引法に基づく表記を開く。\n確認: 支払方法に「銀行振込（銀行振込をご希望の場合はお問い合わせください）」、支払時期に「銀行振込の場合は、当社が送付する請求書に記載の期日までにお振込みください」。" });
      await adminLogin(page);
      await step(page, this, "管理画面: 代理登録の画面（ADM-025「申込を登録する」）", async () => {
        await page.goto(`${BASE}/admin/bank-transfers`);
        await page.getByRole("link", { name: "申込を登録する" }).click();
        await page.waitForURL(/\/admin\/bank-transfers\/new/);
        await page.getByLabel("会員のメールアドレス").waitFor();
      }, { fullPage: true, desc: "操作: 銀行振込申込一覧の「申込を登録する」を押す。\n確認: 会員のメールアドレス・対象・プラン・お支払いサイクル・運営メモを入力する代理登録画面。" });
      await ctx.close();
    },
  },
  // =========================================================================
  {
    id: "P10",
    name: "動画プランの整理",
    changes: [
      "「自己 PR 動画掲載」と「職場紹介動画掲載」を「プロフィール動画制作プラン」（10 万円）に統合。",
      "「ビジ友公式 SNS 動画制作プラン」（12 万円）を新設。",
      "「職場紹介動画」の新規販売を停止（既存データ・処理は維持）。",
      "プロフィール動画を全会員が購入可に変更（旧「発注者プラン加入者のみ」の制限を撤廃）。",
      "プロフィール動画の説明文を全面的に書き換え（「スタッフが現地に伺って撮影・編集」「エリアにより交通費が発生する場合がある」を明記）。",
      "説明文から「TikTok 紹介ページ」を削除し、SNS 掲載は 12 万円プランに集約。",
      "料金画面に付属プランの注意書きを追加（プレミアム・ハイエンドは申込不要、年払いの方は公式 SNS 動画も含まれる）。",
      "画面上の呼び方を統一（会員が見る見出しは「プロフィール動画」、管理画面のタブは画面名に変更）。",
      "動画掲載のお知らせメールの記載を、商品名から掲載先に変更。",
      "動画オプションの申込完了メールの結びを、3 プラン共通の文言に変更。",
      "管理画面の絞り込みに「ユーザー撮影動画制作プラン」「ビジ友公式 SNS 動画」を追加。",
    ],
    tests: [
      "vitest: video_sns の Checkout / 銀行振込 / 代理登録、職場紹介動画の販売停止（3 入口で拒否）、メール文言",
      "pgTAP: bank_transfer_requests の制約に video_sns を追加",
      "E2E: billing.spec.ts / video-display.spec.ts / bank-transfer.spec.ts の期待値を新名称に更新",
    ],
    limits: "掲載お知らせメールの【掲載先】表記は P4 の項目で確認した。",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await login(page, U.contractor);
      await step(page, this, "料金画面のオプション欄（3 プラン・説明文・注意書き）", async () => {
        await page.goto(`${BASE}/billing`);
        await page.getByText("ビジ友公式SNS動画制作プラン").first().waitFor();
        const t = await bodyText(page);
        for (const w of ["プロフィール動画制作プラン", "100,000", "120,000", "交通費", "お申し込みは不要"]) check(t.includes(w), `「${w}」がある`);
        for (const w of ["自己PR動画掲載", "職場紹介動画掲載", "TikTok紹介ページ"]) check(!t.includes(w), `旧表記「${w}」が無い`);
      }, { fullPage: true, desc: "操作: 無料の職人（発注者プラン未加入）で料金プラン画面を開き、全文を検査。\n確認: プロフィール動画制作プラン 100,000 円 / ユーザー撮影動画制作プラン / ビジ友公式SNS動画制作プラン 120,000 円。無料会員でも申込ボタンが押せる。交通費・プレミアム/ハイエンド付属の注意書きがある。旧「自己PR動画掲載」「職場紹介動画掲載」「TikTok紹介ページ」が無い。" });
      await step(page, this, "会員が見る見出しは「プロフィール動画」", async () => {
        await page.goto(`${BASE}/clients/${ID.client}`);
        await page.getByRole("heading", { name: "プロフィール動画" }).waitFor();
        check(!(await bodyText(page)).includes("職場紹介動画"), "旧「職場紹介動画」が無い");
      }, { fullPage: true, desc: "操作: 発注者詳細（鈴木工務店）を開く。\n確認: 動画欄の見出しが「プロフィール動画」（旧「職場紹介動画」）。" });
      await adminLogin(page);
      await step(page, this, "管理画面のタブは画面名（ADM-027）", async () => {
        await page.goto(`${BASE}/admin/users/${ID.contractor}/videos?placement=contractor_page`);
        await page.getByRole("tab", { name: "ユーザープロフィール（ユーザー詳細）" }).waitFor();
        await page.getByRole("tab", { name: "発注者情報詳細（発注者詳細）" }).waitFor();
      }, { desc: "操作: 動画管理を開く。\n確認: タブ名が「ユーザープロフィール（ユーザー詳細）/ 発注者情報詳細（発注者詳細）」（旧「受注者PR動画 / 職場紹介動画」）。" });
      await step(page, this, "管理画面の絞り込みに新しいプラン（ADM-008）", async () => {
        await page.goto(`${BASE}/admin/users`);
        await page.getByRole("combobox").first().click();
        await page.getByRole("option", { name: "ユーザー撮影動画制作プラン" }).waitFor();
        await page.getByRole("option", { name: "ビジ友公式SNS動画" }).waitFor();
      }, { desc: "操作: ユーザー一覧のオプション絞り込みを開く。\n確認: 「プロフィール動画制作プラン / ユーザー撮影動画制作プラン / ビジ友公式SNS動画制作プラン」が並ぶ（補償は無い）。" });
      await page.keyboard.press("Escape");
      const { since } = await bankFlow(page, this, { email: U.contractor4, optionLabel: /ビジ友公式SNS動画/, labelForTitle: "ビジ友公式SNS動画制作プラン" });
      await shotMails(page, this, since, ["オプションのお申し込みを承りました", "お申し込みを承りました"], "メール: 動画オプションの申込完了（結びが 3 プラン共通）",
        "有効化したときに会員へ送られるメール。\n確認: 結びが「今後の進め方については、運営よりご連絡いたします」。", 1);
      await ctx.close();
    },
  },
  // =========================================================================
  {
    id: "P11",
    name: "価格改定と比較表",
    changes: [
      "月額を改定（ライト 2,800 円／スタンダード 9,800 円／プレミアム 28,000 円／ハイエンド 168,000 円、税込）。",
      "初回事務手数料を 20,000 円→12,000 円に改定。",
      "上位表示の対象にスタンダードを追加。",
      "プレミアムの担当者上限を 10 人→5 人に変更。",
      "プランの新規申込時に運営宛の通知メールを 1 通新設。",
      "プラン比較表に年額の行を追加し、金額をベタ書きから自動反映に変更。",
      "比較表に 4 行を新設（案件募集機能／サポート担当（スカウト）／プロフィール動画制作／ビジ友公式 SNS 動画制作）。",
      "比較表の「現場掲載 1 件/月」を「1 件まで」に修正（実際の仕組みは同時掲載 1 件のため）。",
      "比較表の下にオプション価格表を追加（急募 20,000 円／プロフィール動画 100,000 円／ユーザー撮影 20,000 円／公式 SNS 動画 120,000 円）。",
    ],
    tests: [
      "pgTAP: list_plan_rank（スタンダードを上位表示に追加）",
      "vitest: 新価格・事務手数料・担当者上限、運営宛メール 3 件",
      "E2E: billing.spec.ts（比較表を新規追加）、members 系（上限）",
    ],
    limits: "",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await login(page, U.contractor);
      await step(page, this, "料金プラン画面: 新しい月額と初回事務手数料", async () => {
        await page.goto(`${BASE}/billing`);
        await page.getByText("ハイエンドプラン").first().waitFor();
        const t = await bodyText(page);
        for (const p of ["2,800", "9,800", "28,000", "168,000", "12,000"]) check(t.includes(p), `${p} 円がある`);
        check(!t.includes("20,000円の初回") && !/初回事務手数料[^。]*20,000/.test(t), "旧手数料 20,000 円の表記が無い");
      }, { fullPage: true, desc: "操作: 無料会員で料金プラン画面を開く。\n確認: 月額 2,800 / 9,800 / 28,000 / 168,000 円、初回事務手数料 12,000 円。" });
      await step(page, this, "プラン比較表（年額・新しい行・1件まで）", async () => {
        await page.goto(`${BASE}/billing/plans`);
        await page.getByRole("heading", { name: "プラン一覧" }).waitFor();
        const t = await bodyText(page);
        for (const w of ["年額", "案件募集機能", "サポート担当", "プロフィール動画制作", "ビジ友公式SNS動画制作", "1件まで"]) check(t.includes(w), `「${w}」がある`);
        check(!t.includes("1件/月"), "旧「1件/月」が無い");
      }, { fullPage: true, desc: "操作: プラン比較表を開く。\n確認: 月額と年額の 2 行、「案件募集機能」「サポート担当（スカウト）」「プロフィール動画制作」「ビジ友公式SNS動画制作」の行、現場掲載のライトが「1件まで」、上位表示はスタンダード以上 ○、複数人利用はプレミアム 5 人。" });
      await step(page, this, "比較表の下のオプション価格表", async () => {
        const t = await bodyText(page);
        for (const w of ["急募", "20,000", "100,000", "120,000"]) check(t.includes(w), `「${w}」がある`);
      }, { target: () => page.locator("table").last(), desc: "確認: 急募 20,000 円 / プロフィール動画制作プラン 100,000 円 / ユーザー撮影動画制作プラン 20,000 円 / ビジ友公式SNS動画制作プラン 120,000 円。" });
      await step(page, this, "上位表示にスタンダードを追加（発注者一覧の並び）", async () => {
        await page.goto(`${BASE}/clients`);
        await page.getByText("ハイエンド建設株式会社").first().waitFor();
        return `DB のランク: ${psql("select string_agg(r, ' / ') from (select list_plan_rank || '=' || count(*) || '人' as r from users where role='client' and deleted_at is null group by list_plan_rank order by list_plan_rank desc) x")}（3=ハイエンド 2=プレミアム 1=スタンダード 0=その他）`;
      }, { fullPage: true, desc: "操作: 発注者一覧をおすすめ順で開く。\n確認: ハイエンド → プレミアム → スタンダード → その他の順（スタンダードがその他より上に来る）。" });
      await login(page, U.client);
      for (const [n, label] of [[5, "5 人目（登録できる）"], [6, "6 人目（上限エラー）"]]) {
        await step(page, this, `担当者の上限: ${label}`, async () => {
          await page.goto(`${BASE}/mypage/members/new`);
          await page.getByRole("heading", { name: "担当者新規作成" }).waitFor();
          await page.getByPlaceholder("田中").fill("確認");
          await page.getByPlaceholder("一郎").fill(`担当${n}`);
          await page.locator("#email").fill(`verify-member-${n}-${Date.now()}@test.local`);
          await page.getByRole("button", { name: "入力内容を確認する" }).click();
          await page.getByRole("button", { name: "送信する" }).click();
          if (n === 5) await page.waitForURL(/\/mypage\/members(\?|$)/, { timeout: 20000 });
          else await page.getByText(/担当者の上限（5人）に達しています/).waitFor({ timeout: 20000 });
        }, { fullPage: n === 5, desc: n === 5
          ? "操作: プレミアムの Owner（担当者 4 名）で担当者を 1 名追加。\n確認: 5 人目は登録でき、担当者一覧に戻る。"
          : "操作: もう 1 名追加しようとする。\n確認: 「担当者の上限（5人）に達しています」で登録されない。" });
      }
      await ctx.close();
      // 運営宛「プランの新規お申し込み」メール: 銀行振込の有効化（P2）で送られたものを撮る
      const { ctx: ctx2, page: page2 } = await newPage(browser);
      await shotMails(page2, this, RUN_STARTED, ["プランの新規お申し込みがありました"], "メール: 運営宛「プランの新規お申し込みがありました」（新設）",
        "P2 の項目で銀行振込の契約を有効化したときに運営へ送られたメール。\n確認: 申込者・お申し込みプラン（年払い）・お支払い方法「銀行振込」・ご利用開始日・発注者アカウント詳細へのリンク。", 1);
      await ctx2.close();
    },
  },
  // =========================================================================
  {
    id: "B",
    name: "クライアント指摘の不具合修正",
    changes: [
      "スマホで入力欄が拡大したまま戻らない問題を修正（メッセージ入力欄、スカウトテンプレート、職種・資格検索の 3 ファイル 5 箇所）。",
      "検索条件を開いたときの自動フォーカスを止めた（3 画面に一括適用）。",
      "マイリストでハートを外すと、その場でカードが消えるようにした。",
      "退会できなくなる「詰み」状態を解消（管理画面から期限切れの発注済み案件を「完了扱い」「取消」にできるようにした）。",
      "退会できないときのメッセージに、対象の案件名とお問い合わせ案内を追加。",
      "法人アカウントが職人としてスカウトを受けたとき、受諾／辞退ボタンが出ない不具合を修正。",
      "スカウトを送った側に「相手の返答を待っています」を表示するようにした。",
      "担当者がスカウトを受けた場合の案内文を追加。",
      "受注者が「結果待ち」の応募を自分で取り下げられるようにした（FAQ との不整合を解消）。",
      "管理画面の「もどる」ボタンの飛び先を修正（応募一覧の検索後、ユーザー詳細→発注者詳細の 2 経路）。",
      "管理画面の検索欄が、ブラウザの戻るで元に戻るようにした（6 画面）。",
      "プロフィール写真が WebP 形式だと保存に失敗する不具合を修正。",
      "本人確認書類の画像が表示できないときの自動やり直しと、案内文言を改善。",
    ],
    tests: [
      "vitest: scout-recipient 8 件、スカウト応答 4 件、期限切れ解消 14 件、取り下げ・メール 7 件、アバター拡張子 5 件、署名 URL の再試行 3 件ほか",
      "E2E: job-search.spec.ts（自動フォーカス 1・マイリスト 3）、messaging.spec.ts（No.33 4 件）、admin.spec.ts（ADM-014 2・もどる 2・検索欄 2）、matching.spec.ts（取り下げ 1）、auth.spec.ts（退会ガード文言 1）",
    ],
    limits: "本人確認書類の画像の自動やり直しは、署名付き URL の発行が一時的に失敗したときだけ動く。ローカルでは失敗を起こせないため、自動テスト（再試行 3 件）と正常表示の確認とした。",
    async run(browser) {
      // --- スマホ: 入力欄の文字サイズ・自動フォーカス
      const m = await newPage(browser, true);
      const sp = m.page;
      await login(sp, U.contractor);
      await step(sp, this, "スマホ: メッセージ入力欄の文字サイズ 16px", async () => {
        await sp.goto(`${BASE}/messages/${ID.msgThreadIndiv}`);
        const ta = sp.locator("textarea[placeholder='メッセージ']");
        await ta.waitFor();
        const size = await ta.evaluate((el) => getComputedStyle(el).fontSize);
        check(parseFloat(size) >= 16, `16px 以上（実際: ${size}）`);
        return `実測 font-size: ${size}（iOS Safari は 16px 未満だと入力時に自動で拡大する）`;
      }, { mobile: true, desc: "操作: スマホ幅（390px）でメッセージスレッドを開く。\n確認: 入力欄の文字サイズが 16px 以上（ブラウザで実測）。" });
      await step(sp, this, "スマホ: 検索条件を開いてもキーボードが出ない（自動フォーカスしない）", async () => {
        await sp.goto(`${BASE}/jobs/search`);
        await sp.getByRole("button", { name: "検索条件" }).click();
        const dialog = sp.getByRole("dialog");
        await dialog.waitFor();
        const kw = dialog.getByPlaceholder("キーワードを入力");
        await kw.waitFor();
        const focused = await kw.evaluate((el) => document.activeElement === el);
        check(!focused, "キーワード欄にフォーカスしていない");
        const size = await kw.evaluate((el) => getComputedStyle(el).fontSize);
        return `キーワード欄のフォーカス: なし / 文字サイズ: ${size}`;
      }, { mobile: true, desc: "操作: スマホ幅で募集案件一覧の「検索条件」を開く。\n確認: キーワード欄に自動でフォーカスせず、キーボードが立ち上がらない。" });
      await step(sp, this, "スマホ: 職種・資格検索の入力欄の文字サイズ 16px", async () => {
        const dialog = sp.getByRole("dialog");
        await dialog.getByRole("button", { name: /職種|選択/ }).first().click({ position: { x: 5, y: 5 } });
        const input = sp.locator('input[role="combobox"]').last();
        await input.waitFor();
        const size = await input.evaluate((el) => getComputedStyle(el).fontSize);
        check(parseFloat(size) >= 16, `16px 以上（実際: ${size}）`);
        return `実測 font-size: ${size}`;
      }, { mobile: true, desc: "操作: 検索条件の職種の選択欄を開く。\n確認: 候補を絞り込む入力欄の文字サイズが 16px 以上。" });
      await login(sp, U.client);
      await step(sp, this, "スマホ: スカウトテンプレートの入力欄の文字サイズ 16px", async () => {
        await sp.goto(`${BASE}/messages/templates/new`);
        const fields = sp.locator("input:not([type=hidden]), textarea");
        await fields.first().waitFor();
        const sizes = await fields.evaluateAll((els) => els.map((el) => getComputedStyle(el).fontSize));
        check(sizes.every((s) => parseFloat(s) >= 16), `すべて 16px 以上（実際: ${sizes.join(", ")}）`);
        return `実測 font-size: ${sizes.join(", ")}`;
      }, { mobile: true, desc: "操作: スマホ幅でスカウトテンプレートの新規作成を開く。\n確認: タイトル・本文の入力欄の文字サイズが 16px 以上。" });
      await m.ctx.close();

      const { ctx, page } = await newPage(browser);
      // --- マイリスト
      await login(page, U.contractor3);
      await step(page, this, "マイリスト: ハートを外すとその場でカードが消える", async () => {
        await page.goto(`${BASE}/clients/${ID.client}`);
        await page.getByRole("button", { name: "マイリスト登録" }).first().click();
        await page.getByRole("button", { name: "マイリスト解除" }).first().waitFor();
        await page.waitForLoadState("networkidle");
        await page.goto(`${BASE}/favorites?type=client`);
        const counter = page.getByText(/^全\d+件$/);
        await counter.waitFor();
        const before = Number((await counter.textContent()).replace(/[^\d]/g, ""));
        await page.getByRole("button", { name: "マイリスト解除" }).first().click();
        if (before === 1) await page.getByText("マイリストに登録されたものはありません。").waitFor({ timeout: 15000 });
        else await page.getByText(`全${before - 1}件`).waitFor({ timeout: 15000 });
        return `解除前 ${before} 件 → 解除後 ${before - 1} 件（ページを開き直さずに反映）`;
      }, { fullPage: true, desc: "操作: 発注者を 1 件マイリストに登録し、マイリスト（発注者タブ）でハートを外す。\n確認: ページを開き直さなくてもカードが消え、件数が 1 減る。" });
      // --- 取り下げ
      const sinceWithdraw = Date.now();
      await step(page, this, "結果待ちの応募に「応募を取り下げる」", async () => {
        await page.goto(`${BASE}/applications/history/${ID.appliedForWithdraw}`);
        await page.getByText("応募結果待ち").first().waitFor();
        await page.getByRole("button", { name: "応募を取り下げる" }).waitFor();
      }, { fullPage: true, desc: "操作: 職人（渡辺大輔）で結果待ちの応募詳細を開く。\n確認: 「応募を取り下げる」ボタンがある（以前は結果待ちでは取り下げできなかった）。" });
      await step(page, this, "取り下げの確認 → 取り下げ", async () => {
        await page.getByRole("button", { name: "応募を取り下げる" }).click();
        const dialog = page.getByRole("alertdialog");
        await dialog.getByText("応募を取り下げますか？").waitFor();
        await dialog.getByRole("button", { name: "取り下げる" }).click();
        await page.waitForURL(/\/applications\/history$/, { timeout: 20000 });
      }, { fullPage: true, desc: "操作: 「応募を取り下げる」→ 確認ダイアログで「取り下げる」。\n確認: 応募履歴に戻り、その応募はキャンセル扱いになる。" });
      await shotMails(page, this, sinceWithdraw, ["応募を取り下げ", "取り下げ"], "メール: 応募の取り下げ（発注者宛・本人控え）",
        "取り下げたときに送られるメール。\n確認: 発注者宛「〇〇さんが応募を取り下げました」と本人宛の控え。", 2);
      // --- 退会ガード
      await login(page, U.contractor);
      await step(page, this, "退会できないときのメッセージ（案件名とお問い合わせ案内）", async () => {
        await page.goto(`${BASE}/profile/withdrawal`);
        await page.getByText("お選びください").click();
        await page.getByRole("option", { name: "仕事の依頼が来なかった" }).click();
        await page.getByLabel("上記内容に同意して退会する").check();
        await page.getByRole("button", { name: "退会する" }).click();
        await page.getByText(/応募中または進行中の案件（.+）があるため退会できません/).waitFor({ timeout: 15000 });
        await page.getByText(/お問い合わせからご連絡ください/).first().waitFor();
      }, { fullPage: true, desc: "操作: 発注済みの応募が残る職人（contractor@test.local）で退会手続きを進める。\n確認: 「応募中または進行中の案件（案件名）があるため退会できません」と、期限切れの場合のお問い合わせ案内が出る。退会は実行されない。" });
      // --- スカウト
      await login(page, U.client);
      await step(page, this, "法人 Owner が職人としてスカウトを受ける: ボタンが出る", async () => {
        await page.goto(`${BASE}/messages/${ID.corpScoutThread}`);
        await page.getByRole("button", { name: "スカウトを受ける" }).waitFor();
        await page.getByRole("button", { name: "スカウトを断る" }).waitFor();
      }, { fullPage: true, desc: "操作: 法人（鈴木工務店）の Owner で、別の法人から届いたスカウトのスレッドを開く。\n確認: 「スカウトを受ける」「スカウトを断る」が出る（以前は法人同士だと出なかった）。" });
      await login(page, U.staff);
      await step(page, this, "受けた側の担当者には案内文", async () => {
        await page.goto(`${BASE}/messages/${ID.corpScoutThread}`);
        await page.getByText("スカウトへの返答は管理責任者のみ行えます").waitFor();
        check((await page.getByRole("button", { name: "スカウトを受ける" }).count()) === 0, "ボタンは出ない");
      }, { fullPage: true, desc: "操作: 同じ法人の担当者で同じスレッドを開く。\n確認: ボタンの代わりに「スカウトへの返答は管理責任者のみ行えます」。" });
      await login(page, U.client2);
      await step(page, this, "送った側には「相手の返答を待っています」", async () => {
        await page.goto(`${BASE}/messages/${ID.corpScoutThread}`);
        await page.getByText("相手の返答を待っています").waitFor();
      }, { fullPage: true, desc: "操作: スカウトを送った法人（client2）で同じスレッドを開く。\n確認: 「相手の返答を待っています」が出る。" });
      // --- 管理画面
      await adminLogin(page);
      await step(page, this, "ADM-014: 期限切れの発注済み応募に「完了扱い」「取消」", async () => {
        await page.goto(`${BASE}/admin/applications/${ID.expiredAccepted}`);
        await page.getByRole("button", { name: "完了扱いにする" }).waitFor();
        await page.getByRole("button", { name: "発注を取り消す" }).waitFor();
      }, { fullPage: true, desc: "操作: 稼働終了日から 5 日を過ぎた発注済み応募の詳細（ADM-014）を開く。\n確認: 「完了扱いにする」「発注を取り消す」が出る（当事者が操作できなくなった応募を運営が解消できる）。" });
      await step(page, this, "完了扱いにする → 取引完了", async () => {
        await page.getByRole("button", { name: "完了扱いにする" }).click();
        const dialog = page.getByRole("alertdialog");
        await dialog.getByRole("button", { name: "完了扱いにする" }).click();
        await page.getByText("取引完了", { exact: true }).waitFor({ timeout: 20000 });
      }, { fullPage: true, desc: "操作: 「完了扱いにする」→ 確認ダイアログで「完了扱いにする」。\n確認: 状態が「取引完了」になり、解消ボタンが消える。" });
      await step(page, this, "もどる: 発注者詳細 → 応募一覧で検索 → もどる で発注者詳細へ", async () => {
        await page.goto(`${BASE}/admin/clients/${ID.client}`);
        const more = page.getByRole("button", { name: /もっと見る/ });
        if (await more.isVisible().catch(() => false)) await more.click();
        await page.getByRole("link", { name: /^応募 \d+件$/ }).first().click();
        await page.waitForURL(/\/admin\/applications\?jobId=.*backTo=/);
        await page.getByRole("button", { name: "検索" }).click();
        await page.waitForURL(/\/admin\/applications\?.*backTo=/);
        await page.getByRole("link", { name: "もどる" }).click();
        await page.waitForURL(new RegExp(`/admin/clients/${ID.client}`));
      }, { desc: "操作: 発注者詳細の「応募◯件」→ 応募一覧で「検索」→「もどる」。\n確認: ダッシュボードではなく元の発注者詳細に戻る。" });
      await step(page, this, "もどる: ユーザー詳細 → 発注者詳細 → もどる でユーザー詳細へ", async () => {
        await page.goto(`${BASE}/admin/users/${ID.client}`);
        await page.getByRole("link", { name: "発注者詳細" }).click();
        await page.waitForURL(/backTo=/);
        await page.getByRole("link", { name: "もどる" }).click();
        await page.waitForURL(new RegExp(`/admin/users/${ID.client}`));
      }, { desc: "操作: ユーザー詳細の「発注者詳細」→「もどる」。\n確認: 発注者一覧ではなく元のユーザー詳細に戻る。" });
      await step(page, this, "検索欄: ブラウザの戻るで入力欄も元に戻る", async () => {
        await page.goto(`${BASE}/admin/clients`);
        const kw = page.getByLabel("キーワード");
        await kw.fill("鈴木");
        await page.getByRole("button", { name: "検索" }).click();
        await page.waitForURL(/q=/);
        await kw.fill("");
        await kw.fill("ハイエンド");
        await page.getByRole("button", { name: "検索" }).click();
        await page.waitForURL(/q=%E3%83%8F/);
        await page.goBack();
        await page.waitForURL(/q=%E9%88%B4/);
        await page.waitForFunction(() => document.querySelector("#admin-client-keyword")?.value === "鈴木", null, { timeout: 5000 }).catch(() => {});
        const v = await kw.inputValue();
        check(v === "鈴木", `戻った後の入力欄が「鈴木」（実際: ${v}）`);
        return `「鈴木」で検索 →「ハイエンド」で検索 → ブラウザの戻る → 入力欄: 「${v}」`;
      }, { desc: "操作: 発注者一覧で「鈴木」→「ハイエンド」と続けて検索し、ブラウザの戻るを押す。\n確認: 一覧だけでなく検索欄の表示も「鈴木」に戻る。" });
      let verificationUrl = "";
      await step(page, this, "本人確認書類: 画像を取得できないときの案内文", async () => {
        await page.goto(`${BASE}/admin/verifications`);
        await page.getByRole("link", { name: /山本/ }).first().click();
        await page.waitForURL(/\/admin\/verifications\/[0-9a-f-]+/);
        verificationUrl = page.url();
        await page.getByText("書類を表示できませんでした。ページを再読み込みしてください").first().waitFor({ timeout: 20000 });
        return `ローカルのストレージにある書類ファイル: ${psql("select count(*) from storage.objects where bucket_id='identity-documents'")} 件（テストデータは DB にパスだけがあり、画像本体が無い）`;
      }, { fullPage: true, desc: "操作: 本人確認一覧から山本健の申請詳細を開く。テストデータには画像ファイル本体が無いため、署名付き URL の発行が失敗する状態。\n確認: 自動で 1 回やり直したうえで、「書類を表示できませんでした。ページを再読み込みしてください」の案内が出る（改善後の文言）。" });
      await step(page, this, "本人確認書類: 画像があれば表示される", async () => {
        const png = await page.evaluate(() => {
          const make = (label) => {
            const c = document.createElement("canvas");
            c.width = 480; c.height = 300;
            const g = c.getContext("2d");
            g.fillStyle = "#eef3f8"; g.fillRect(0, 0, 480, 300);
            g.strokeStyle = "#8aa"; g.strokeRect(10, 10, 460, 280);
            g.fillStyle = "#335"; g.font = "bold 28px sans-serif"; g.fillText(label, 40, 160);
            return c.toDataURL("image/png").split(",")[1];
          };
          return [make("本人確認書類（表）確認用"), make("本人確認書類（裏）確認用")];
        });
        const paths = psql(`select document_url_1 || '|' || document_url_2 from identity_verifications where id='${verificationUrl.split("/").pop()}'`).split("|");
        const env = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
        const key = (env.match(/^SERVICE_ROLE_KEY="?([^"\n]+)"?/m) ?? [])[1];
        check(Boolean(key), "ローカルの管理キーを取得できる");
        for (let i = 0; i < 2; i++) {
          const res = await fetch(`http://127.0.0.1:54321/storage/v1/object/identity-documents/${paths[i]}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "image/png", "x-upsert": "true" },
            body: Buffer.from(png[i], "base64"),
          });
          check(res.ok, `画像を配置できる（HTTP ${res.status}）`);
        }
        await page.goto(verificationUrl);
        await page.locator("img[alt*='書類'], img[src*='identity-documents']").first().waitFor({ timeout: 20000 });
        return "ローカルのストレージに確認用の画像 2 枚を配置してから再表示";
      }, { fullPage: true, desc: "操作: ローカルのストレージに確認用の画像（表・裏）を置いて、同じ申請詳細を開き直す。\n確認: 書類画像が表示される。" });
      // --- WebP アバター
      await login(page, U.contractor4);
      await step(page, this, "プロフィール写真を WebP で登録", async () => {
        await page.goto(`${BASE}/profile/edit`);
        await page.getByRole("button", { name: "画像を登録する" }).waitFor();
        const b64 = await page.evaluate(() => {
          const c = document.createElement("canvas");
          c.width = 240; c.height = 240;
          const g = c.getContext("2d");
          g.fillStyle = "#920783"; g.fillRect(0, 0, 240, 240);
          g.fillStyle = "#fff"; g.font = "bold 48px sans-serif"; g.fillText("WebP", 50, 135);
          return c.toDataURL("image/webp").split(",")[1];
        });
        await page.locator("input[type=file]").first().setInputFiles({ name: "avatar.webp", mimeType: "image/webp", buffer: Buffer.from(b64, "base64") });
        await page.waitForFunction(() => !document.body.innerText.includes("アップロード中..."), null, { timeout: 30000 });
        await page.waitForTimeout(800);
        const t = await bodyText(page);
        check(!t.includes("アップロードに失敗") && !t.includes("保存に失敗"), "エラーが出ない");
        const url = psql("select coalesce(avatar_url,'') from users where email='contractor4@test.local'");
        check(url.length > 0, "DB に写真の URL が保存される");
        return `保存された avatar_url: ${url.split("/").slice(-2).join("/")}`;
      }, { desc: "操作: プロフィール編集の「画像を登録する」で WebP 形式の画像を選ぶ。\n確認: エラーにならず写真が表示され、DB に保存される（以前は WebP だと保存に失敗していた）。" });
      await ctx.close();
    },
  },
  // =========================================================================
  {
    id: "C",
    name: "追加のデザイン修正（9/15 までの対応）",
    changes: [
      "メッセージ本文中の URL を自動でリンクにした。",
      "会員向けの動画表示枠を縦長（9:16）に統一（大きさが不揃いだった問題）。",
      "管理画面 ADM-027 のタブが、スマホ幅ではみ出る問題を修正。",
    ],
    tests: [
      "vitest: linkify 12 件、動画枠の定義 4 件",
      "E2E: messaging.spec.ts「本文中の URL がリンクになり、相手側でも新しいタブで開くリンクとして表示される」",
    ],
    limits: "",
    async run(browser) {
      const { ctx, page } = await newPage(browser);
      await login(page, U.contractor);
      const url = "https://bijiyuu.net/users/sample-introduction";
      const text = `職人のご紹介です。詳細はこちら ${url} 。\njavascript:alert(1) はリンクになりません`;
      await step(page, this, "送信側: 本文の URL がリンクになる", async () => {
        await page.goto(`${BASE}/messages/${ID.msgThreadIndiv}`);
        const input = page.locator("textarea[placeholder='メッセージ']");
        await input.fill(text);
        const res = page.waitForResponse((r) => r.request().method() === "POST" && /\/messages\//.test(r.url()));
        await page.locator("button.rounded-full.bg-primary").last().click();
        const body = await (await res).text();
        check(!body.includes('"success":false'), "送信が成功する");
        const bubble = page.locator("p", { hasText: "職人のご紹介です。" }).last();
        await bubble.getByRole("link", { name: url }).waitFor();
        check((await bubble.getByRole("link").count()) === 1, "リンクは URL の 1 つだけ（句点と javascript: は含まない）");
      }, { target: () => page.locator("p", { hasText: "職人のご紹介です。" }).last().locator("xpath=ancestor::div[3]"), desc: "操作: 職人がメッセージに URL を含めて送信。\n確認: URL だけが下線付きのリンクになり、直後の「。」や「javascript:alert(1)」はリンクにならない。" });
      await login(page, U.individualClient);
      await step(page, this, "受信側: リンクとして表示され、新しいタブで開く", async () => {
        await page.goto(`${BASE}/messages/${ID.msgThreadIndiv}`);
        const link = page.locator("p", { hasText: "職人のご紹介です。" }).last().getByRole("link", { name: url });
        await link.waitFor({ timeout: 15000 });
        check((await link.getAttribute("target")) === "_blank", "target=_blank");
        check((await link.getAttribute("rel")) === "noopener noreferrer", "rel=noopener noreferrer");
      }, { target: () => page.locator("p", { hasText: "職人のご紹介です。" }).last().locator("xpath=ancestor::div[3]"), desc: "操作: 受信した個人発注者でスレッドを開く。\n確認: 同じ URL がリンクで表示され、新しいタブで開く設定（target=_blank / rel=noopener noreferrer）になっている。" });
      await ctx.close();

      for (const mobile of [false, true]) {
        const v = await newPage(browser, mobile);
        const landscape = EXTRA ? join(EXTRA, "landscape.png") : "";
        if (landscape && existsSync(landscape)) {
          await v.page.route("**/thumbnails/thumbnail.jpg", (r) => r.fulfill({ path: landscape, contentType: "image/png" }));
        }
        await login(v.page, U.client);
        await step(v.page, this, `動画枠が同じ大きさ（${mobile ? "スマホ 390px" : "PC"}）`, async () => {
          await v.page.goto(`${BASE}/users/contractors/${ID.contractor2}`);
          const btns = v.page.getByRole("button", { name: /を再生$/ });
          await btns.nth(1).waitFor();
          const a = await btns.nth(0).boundingBox();
          const b = await btns.nth(1).boundingBox();
          check(Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height), "2 本の枠が同じサイズ");
          return `TikTok 埋込: ${Math.round(a.width)}×${Math.round(a.height)}px / Cloudflare 動画: ${Math.round(b.width)}×${Math.round(b.height)}px`;
        }, { mobile, target: () => v.page.getByRole("heading", { name: "プロフィール動画" }).locator("xpath=following-sibling::*[1]"), desc: `操作: ${mobile ? "スマホ幅で" : ""}高橋美咲（TikTok 埋込 1 本・Cloudflare の横動画 1 本）のユーザー詳細を開く。\n確認: 2 本が同じ 9:16 の枠で並ぶ（横動画は切り取らず上下に黒帯）。\n※ テストデータの動画 ID は架空で本物のサムネイルが無いため、Cloudflare 動画のサムネイルだけ横長の確認用画像（市松模様）に差し替えて表示。TikTok 側は取得できずロゴ表示。` });
        await v.ctx.close();
      }

      const s = await newPage(browser, true);
      await adminLogin(s.page);
      await step(s.page, this, "スマホ幅の動画管理（ADM-027）: タブがはみ出さない", async () => {
        await s.page.goto(`${BASE}/admin/users/${ID.contractor2}/videos?placement=contractor_page`);
        await s.page.getByRole("tab", { name: "発注者情報詳細（発注者詳細）" }).waitFor();
        const sw = await s.page.evaluate(() => document.documentElement.scrollWidth);
        check(sw <= 390, `ページの横幅が画面幅以内（実際: ${sw}px）`);
        return `ページの横幅: ${sw}px（画面幅 390px）`;
      }, { mobile: true, desc: "操作: スマホ幅（390px）で動画管理を開く。\n確認: タブ名が 2 行に折り返し、ページが横にはみ出さない（以前は 442px に広がっていた）。" });
      await s.ctx.close();
    },
  },
];

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
async function buildPdf(browser) {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nl = (s) => esc(s).replace(/\n/g, "<br>");
  let tests = null;
  if (EXTRA && existsSync(join(EXTRA, "tests.json"))) tests = JSON.parse(await readFile(join(EXTRA, "tests.json"), "utf8"));

  const summaryRows = SECTIONS.filter((s) => manifest.some((m) => m.section === s.id)).map((s) => {
    const items = manifest.filter((m) => m.section === s.id);
    const ng = items.filter((m) => m.status === "error").length;
    return `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td class="num">${s.changes.length}</td><td class="num">${items.length}</td><td class="${ng ? "ng" : "ok"}">${ng ? `✗ ${ng} 件` : "✓ すべて確認"}</td></tr>`;
  }).join("");

  const sections = SECTIONS.filter((s) => manifest.some((m) => m.section === s.id)).map((s) => {
    const items = manifest.filter((m) => m.section === s.id);
    const ng = items.filter((m) => m.status === "error").length;
    const head = `<section class="sec-head">
  <h1>${esc(s.id)}. ${esc(s.name)}</h1>
  <h3>修正内容</h3><ul>${s.changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
  <h3>自動テスト</h3><ul>${s.tests.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
  <h3>画面での確認</h3>
  <p>ローカル環境（テストデータ投入直後）でブラウザを自動操作し、${items.length} ステップを確認。結果: ${ng === 0 ? '<span class="ok">すべて確認できた</span>' : `<span class="ng">${ng} ステップで確認できなかった</span>`}</p>
  ${s.limits ? `<p class="limit">画面で確認しきれない点: ${esc(s.limits)}</p>` : ""}
  <ol class="toc">${items.map((m) => `<li>${esc(m.title)}${m.status === "error" ? ' <span class="ng">✗</span>' : ' <span class="ok">✓</span>'}</li>`).join("")}</ol>
</section>`;
    const body = items.map((m) => `<div class="step">
  <h2>${esc(s.id)}-${items.indexOf(m) + 1}. ${esc(m.title)} ${m.status === "error" ? '<span class="ng">✗ 確認できず</span>' : '<span class="ok">✓</span>'}</h2>
  ${m.desc ? `<p class="desc">${nl(m.desc)}</p>` : ""}
  ${m.note ? `<p class="note">${nl(m.note)}</p>` : ""}
  ${m.error ? `<p class="err">${esc(m.error)}</p>` : ""}
  <p class="meta">${esc(m.url ?? "")}</p>
  ${m.file ? `<img class="${m.mobile ? "sp" : ""}" src="file://${join(PNG, m.file)}" />` : ""}
</div>`).join("\n");
    return head + body;
  }).join("\n");

  const total = manifest.length;
  const failed = manifest.filter((m) => m.status === "error").length;
  const testTable = tests ? `<table class="grid"><tr><th>種類</th><th>内容</th><th>結果</th></tr>
${tests.map((t) => `<tr><td>${esc(t.kind)}</td><td>${nl(t.what)}</td><td class="${t.ok ? "ok" : "ng"}">${nl(t.result)}</td></tr>`).join("")}</table>` : "";

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 12mm 10mm; }
  body { font-family: -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif; margin: 0; color: #222; }
  .cover { page-break-after: always; }
  .sec-head { page-break-before: always; }
  h1 { font-size: 20px; color: #6b1d6e; border-bottom: 2px solid #920783; padding-bottom: 4px; }
  h2 { font-size: 13px; margin: 0 0 4px; }
  h3 { font-size: 13px; margin: 14px 0 4px; color: #6b1d6e; }
  p, li { font-size: 11.5px; line-height: 1.7; }
  ul, ol { margin: 4px 0; padding-left: 20px; }
  .step { page-break-inside: avoid; margin: 14px 0 18px; padding-top: 8px; border-top: 1px solid #eee; }
  .desc { background: #f6f2f8; border-left: 3px solid #920783; padding: 6px 10px; margin: 0 0 4px; }
  .note { background: #eef6f0; border-left: 3px solid #2a7; padding: 4px 10px; margin: 0 0 4px; }
  .limit { background: #fff7e6; border-left: 3px solid #e0a000; padding: 6px 10px; }
  .meta { color: #888; font-size: 9px; margin: 0 0 4px; word-break: break-all; }
  .ok { color: #1a8a4a; font-weight: bold; } .ng { color: #c33; font-weight: bold; } .err { color: #c33; font-size: 10.5px; }
  img { display: block; max-width: 100%; max-height: 205mm; border: 1px solid #ddd; margin: 0 auto; }
  img.sp { max-width: 55%; }
  table.grid { border-collapse: collapse; width: 100%; margin: 8px 0; }
  table.grid th, table.grid td { border: 1px solid #ddd; padding: 5px 8px; font-size: 11px; text-align: left; vertical-align: top; }
  table.grid th { background: #f3eef5; }
  td.num { text-align: right; }
</style></head><body>
<section class="cover">
  <h1>ビジ友 2026-08〜09 改修 動作確認レポート</h1>
  <p>作成日時: ${esc(new Date().toLocaleString("ja-JP"))} ／ 対象: 作業ブランチ feature/spec-changes-202608（ステージング未反映）をローカル環境（${esc(BASE)}）で実行</p>
  <h3>このレポートについて</h3>
  <p>変更点一覧（docs/requirements/changes-summary-202609.md）の項目ごとに、次の 2 つの方法で確認した結果をまとめたものです。</p>
  <ul>
    <li><b>自動テスト:</b> 単体テスト（vitest）、データベースの権限テスト（pgTAP）、ブラウザを使った通しテスト（Playwright E2E）を全件実行しました。</li>
    <li><b>画面での確認:</b> テストデータを投入し直した環境で、Playwright がブラウザを実際に操作し、各画面をスクリーンショットに残しました。各ステップには「操作: 何をしたか」「確認: 何を見たか」を書き、確認できたものに ✓ を付けています。数値の実測値や DB の値は緑の枠に記載しています。</li>
  </ul>
  <p>変更点一覧の各行は、あらかじめコミット履歴と実際のコードで突き合わせ、差異を一覧に反映しています。</p>
  <p>ローカル環境ではメールを送信せずファイルに書き出すため、その内容を表示して撮影しています（メール上部のロゴ画像はローカルでは読み込めないため代替表示になっています）。カード決済（Stripe）や動画ファイルのアップロード（Cloudflare）など外部サービスが必要な部分は、各項目の「画面で確認しきれない点」に書き、自動テストの結果で補っています。</p>
  <h3>自動テストの結果</h3>
  ${testTable || "<p>（自動テストの結果ファイルなし）</p>"}
  <h3>画面での確認の結果（全 ${total} ステップ、確認できなかったもの ${failed}）</h3>
  <table class="grid"><tr><th>項目</th><th>内容</th><th>修正</th><th>確認ステップ</th><th>結果</th></tr>${summaryRows}</table>
</section>
${sections}
</body></html>`;
  const htmlPath = join(OUT, "report.html");
  await writeFile(htmlPath, html, "utf8");
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`);
  await page.waitForTimeout(1000);
  await page.pdf({ path: join(OUT, PDF_NAME), format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } });
  await page.close();
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  if (process.env.VERIFY_PDF_ONLY === "1") {
    manifest.push(...JSON.parse(await readFile(join(OUT, "manifest.json"), "utf8")));
    const browser = await chromium.launch(process.env.CAPTURE_CHROMIUM_PATH ? { executablePath: process.env.CAPTURE_CHROMIUM_PATH } : {});
    await buildPdf(browser);
    await browser.close();
    console.log(`PDF: ${join(OUT, PDF_NAME)}`);
    return;
  }
  await rm(OUT, { recursive: true, force: true });
  await mkdir(PNG, { recursive: true });
  const browser = await chromium.launch(process.env.CAPTURE_CHROMIUM_PATH ? { executablePath: process.env.CAPTURE_CHROMIUM_PATH } : {});
  for (const sec of SECTIONS) {
    if (ONLY.length > 0 && !ONLY.includes(sec.id)) continue;
    console.log(`▶ ${sec.id} ${sec.name}`);
    try {
      await sec.run(browser);
    } catch (err) {
      console.log(`  ✗ ${sec.id} aborted: ${String(err).split("\n")[0]}`);
      seq += 1;
      manifest.push({ seq, section: sec.id, title: "項目の途中で中断", status: "error", error: String(err).slice(0, 300), file: null, url: "" });
    }
  }
  await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await buildPdf(browser);
  await browser.close();
  const failed = manifest.filter((m) => m.status === "error");
  console.log(`\n完了: ${manifest.length} ステップ、確認できず ${failed.length}`);
  for (const f of failed) console.log(`  ✗ ${f.section} ${f.title}: ${f.error}`);
  console.log(`PDF: ${join(OUT, PDF_NAME)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
