/**
 * ビジ友 主要フローの操作確認スクリーンショット集（P10/P11 変更後の動作確認用）
 *
 * `capture-screens.mjs`（画面を開くだけ）と違い、実際に操作して結果を撮る。
 * seed のテストユーザーでログインし、応募・発注可否・銀行振込の代理登録〜有効化・
 * 動画の登録・担当者の上限 などを通しで実行し、各ステップの画面を PNG に残す。
 * ローカルはメールがファイル（/tmp/bijiyu-dev-mail）に出るので、届いたメールも画像にする。
 *
 * 使い方（ローカル。**データを変更するので、実行前に `supabase db reset` すること**）:
 *   supabase start && npm run dev
 *   supabase db reset
 *   CAPTURE_CHROMIUM_PATH=... node scripts/capture/capture-flows.mjs
 *
 * 環境変数:
 *   CAPTURE_BASE_URL       既定 http://localhost:3000
 *   CAPTURE_PASSWORD       テストユーザー共通パスワード（既定 testpass123）
 *   CAPTURE_CHROMIUM_PATH  Playwright 既定ブラウザが無い環境で使う実行ファイル（任意）
 *   CAPTURE_FLOWS          特定フローのみ: "F1,F4" のようにカンマ区切り（任意）
 *
 * 出力: scripts/capture/output/flows/png/*.png, manifest.json, ビジ友_操作確認集.pdf
 * 失敗したステップは manifest に error として残し、その時点の画面も撮る（途中で止めない）。
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const BASE = (process.env.CAPTURE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = process.env.CAPTURE_PASSWORD ?? "testpass123";
const ONLY = (process.env.CAPTURE_FLOWS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const OUT = resolve("scripts/capture/output/flows");
const PNG = join(OUT, "png");
const MAIL_DIR = "/tmp/bijiyu-dev-mail";

const USERS = {
  contractor: "contractor@test.local",
  client: "client@test.local", // プレミアム（法人）Owner。担当者 4 名
  admin: "admin@test.local",
  bank: "bank-transfer-e2e@test.local", // 銀行振込 E2E 用（無料）
};

// seed データ
const JOB_FOR_APPLY = "88888888-8888-8888-8888-888888888882"; // 東京都内マンション内装仕上げ工事（木工・東京都）
const APPLICATION_FOR_ACCEPT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbe"; // contractor4 → 千葉案件（applied）
const MSG_THREAD = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05"; // contractor ↔ 中村リフォーム
const CONTRACTOR_ID = "11111111-1111-1111-1111-111111111111";
const CONTRACTOR3_ID = "cc222222-2222-2222-2222-222222222222"; // 動画 0 本 → 掲載完了メールが出る
const CLIENT_ID = "22222222-2222-2222-2222-222222222222";

// ---------------------------------------------------------------------------
// 記録
// ---------------------------------------------------------------------------
const manifest = [];
let seq = 0;

function pad(n) {
  return String(n).padStart(3, "0");
}

async function shot(page, flow, title, opts = {}) {
  seq += 1;
  const file = `${pad(seq)}_${flow.id}_${opts.mail ? "mail" : "screen"}.png`;
  try {
    await page.screenshot({ path: join(PNG, file), fullPage: opts.fullPage ?? true });
  } catch (err) {
    manifest.push({ seq, flow: flow.id, flowName: flow.name, title, status: "error", error: `screenshot: ${String(err).slice(0, 200)}` });
    return;
  }
  manifest.push({ seq, flow: flow.id, flowName: flow.name, title, status: opts.status ?? "ok", file, url: page.url(), note: opts.note ?? "", error: opts.error ?? "" });
}

/** 1 ステップ。失敗しても次へ進む（失敗時もその時点の画面を撮る） */
async function step(page, flow, title, fn, opts = {}) {
  try {
    await fn();
    await page.waitForTimeout(400);
    await shot(page, flow, title, opts);
    return true;
  } catch (err) {
    console.log(`  ✗ ${flow.id} ${title}: ${String(err).split("\n")[0].slice(0, 160)}`);
    await shot(page, flow, title, { ...opts, status: "error", error: String(err).split("\n")[0].slice(0, 300) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// 共通操作
// ---------------------------------------------------------------------------
async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("textbox", { name: /パスワード/ }).fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/(mypage|admin)/, { timeout: 20000 });
}

async function adminLogin(page) {
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel("メールアドレス").fill(USERS.admin);
  await page.getByRole("textbox", { name: /パスワード/ }).fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 20000 });
}

async function newContext(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ja-JP" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  return { ctx, page };
}

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** ローカルのメール出力（/tmp/bijiyu-dev-mail の .json sidecar）から、開始時刻以降の件名一致メールを HTML として撮る */
async function shotMails(page, flow, sinceMs, subjectIncludes, title) {
  let files = [];
  try {
    files = (await readdir(MAIL_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    await shot(page, flow, `${title}（メール出力ディレクトリなし）`, { status: "error", error: `${MAIL_DIR} が無い` });
    return;
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
    await shot(page, flow, `${title}（該当メールなし）`, { status: "error", error: `件名 ${subjectIncludes.join(" / ")} のメールが見つからない` });
    return;
  }
  for (const h of hits.slice(0, 3)) {
    await page.goto(`file://${h.path}`);
    await shot(page, flow, `${title}: 宛先 ${h.to} / 件名 ${h.subject}`, { mail: true, note: h.to });
  }
}

// ---------------------------------------------------------------------------
// フロー定義
// ---------------------------------------------------------------------------
const FLOWS = [
  {
    id: "F1",
    name: "職人（無料）: 案件検索 → 応募 → 応募履歴 → メッセージ送信",
    async run(page) {
      await step(page, this, "ログイン → マイページ", () => login(page, USERS.contractor));
      await step(page, this, "案件一覧（おすすめ順。急募 → ハイエンド → プレミアム → スタンダード → その他）", async () => {
        await page.goto(`${BASE}/jobs/search`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      });
      await step(page, this, "案件詳細（東京都内マンション内装仕上げ工事）", async () => {
        await page.goto(`${BASE}/jobs/${JOB_FOR_APPLY}`);
        await page.getByRole("link", { name: "応募する" }).first().waitFor();
      });
      await step(page, this, "応募フォーム入力", async () => {
        await page.getByRole("link", { name: "応募する" }).first().click();
        await page.waitForURL(/\/apply$/);
        await page.getByPlaceholder("人数を入力").fill("1");
        await page.getByPlaceholder("日程/働き方を入力").fill("平日 8:00〜17:00 で対応可能です");
        await page.locator("input[type='date']").first().fill(futureDate(14));
        await page.getByPlaceholder("申し送り事項があれば入力").fill("操作確認のための応募です");
        await page.getByLabel("上記内容を確認しました").check();
      });
      await step(page, this, "応募内容の確認ダイアログ", async () => {
        await page.getByRole("button", { name: "応募する" }).click();
        await page.getByRole("dialog").waitFor();
      }, { fullPage: false });
      await step(page, this, "確認 OK → 「応募が完了しました」", async () => {
        await page.getByRole("dialog").getByRole("button", { name: "OK" }).click();
        await page.getByText("応募が完了しました").waitFor({ timeout: 20000 });
      }, { fullPage: false });
      await step(page, this, "完了 OK → 応募履歴", async () => {
        await page.getByRole("dialog").getByRole("button", { name: "OK" }).click();
        await page.waitForURL(/\/applications\/history/, { timeout: 20000 });
      });
      await step(page, this, "メッセージ詳細（中村リフォーム）を開く", async () => {
        await page.goto(`${BASE}/messages/${MSG_THREAD}`);
        await page.getByText("中村リフォーム").first().waitFor();
      });
      await step(page, this, "メッセージ送信（画面に即時反映）", async () => {
        const text = `操作確認メッセージ ${new Date().toLocaleTimeString("ja-JP")}`;
        await page.locator("textarea[placeholder='メッセージ']").fill(text);
        await page.locator("button.rounded-full.bg-primary").last().click();
        await page.getByText(text).waitFor();
      });
    },
  },
  {
    id: "F2",
    name: "発注者（プレミアム）: 料金プラン → 比較表 → 案件作成 → 応募一覧 → 発注可否（発注を依頼する）",
    async run(page) {
      await step(page, this, "ログイン → マイページ", () => login(page, USERS.client));
      await step(page, this, "料金プラン画面（新価格・動画 3 プランの行・注意書き）", async () => {
        await page.goto(`${BASE}/billing`);
        await page.getByText("オプションプラン").first().waitFor();
      });
      await step(page, this, "年払いタブに切替（年額 = 月額 × 10）", async () => {
        await page.getByRole("tab", { name: "年払い" }).click();
        await page.waitForTimeout(300);
      });
      await step(page, this, "「こちら」→ プラン比較表", async () => {
        await page.getByRole("link", { name: "こちら" }).click();
        await page.waitForURL(/\/billing\/plans$/);
        await page.getByRole("heading", { name: "プラン一覧" }).waitFor();
      });
      await step(page, this, "マイページ → 募集現場一覧 → 新規作成", async () => {
        await page.goto(`${BASE}/mypage`);
        await page.getByRole("link", { name: "募集現場一覧" }).click();
        await page.waitForURL(/\/jobs\/manage/);
        await page.getByRole("link", { name: "新規作成" }).click();
        await page.waitForURL(/\/jobs\/create/);
      });
      await step(page, this, "案件を下書き保存（タイトルのみ）", async () => {
        await page.getByPlaceholder("案件タイトルを入力").fill(`操作確認 下書き案件 ${Date.now()}`);
        await page.getByRole("button", { name: "下書き保存" }).click();
        await page.getByText("案件を作成しました").waitFor({ timeout: 20000 });
      });
      await step(page, this, "応募一覧（未対応）", async () => {
        await page.goto(`${BASE}/applications/received`);
        await page.getByRole("heading", { name: "応募一覧" }).waitFor();
      });
      await step(page, this, "発注可否: 「発注を依頼する」+ 初回稼働日 + 勤務地を入力", async () => {
        await page.goto(`${BASE}/applications/received/${APPLICATION_FOR_ACCEPT}/decide`);
        await page.getByRole("heading", { name: "発注可否" }).waitFor();
        await page.getByRole("combobox").click();
        await page.getByRole("option", { name: "発注を依頼する" }).click();
        const dateInput = page.locator("input[type='date']");
        await dateInput.waitFor();
        await dateInput.fill(futureDate(14));
        await page.getByPlaceholder("東京都千代田区丸の内XX-XX").fill("東京都港区操作確認1-2-3");
      });
      await step(page, this, "送信 → 結果送信ダイアログ", async () => {
        await page.getByRole("button", { name: "送信する" }).click();
        await page.getByText("ユーザーへ結果を送信しました").waitFor({ timeout: 20000 });
      }, { fullPage: false });
      await step(page, this, "OK → 応募一覧に戻る → 発注履歴", async () => {
        await page.getByRole("button", { name: "OK" }).click();
        await page.waitForURL(/\/applications\/received$/);
        await page.goto(`${BASE}/applications/orders`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      });
    },
  },
  {
    id: "F3",
    name: "一覧の並び順と動画欄: 発注者一覧 / 発注者詳細 / 職人一覧 / 職人詳細",
    async run(page) {
      await step(page, this, "職人でログイン → 発注者一覧（ハイエンド → プレミアム → スタンダード → その他）", async () => {
        await login(page, USERS.contractor);
        await page.goto(`${BASE}/clients`);
        await page.getByLabel("並び替え").waitFor();
      });
      await step(page, this, "発注者詳細（プロフィール動画の欄）", async () => {
        await page.goto(`${BASE}/clients/${CLIENT_ID}`);
        await page.getByRole("heading", { name: "発注者詳細" }).waitFor();
      });
      await step(page, this, "自分のプロフィール（プロフィール動画の欄）", async () => {
        await page.goto(`${BASE}/profile`);
        await page.getByRole("heading", { name: "ユーザープロフィール" }).waitFor();
      });
      await step(page, this, "発注者でログイン → 職人一覧", async () => {
        await page.context().clearCookies();
        await login(page, USERS.client);
        await page.goto(`${BASE}/users/contractors`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      });
      await step(page, this, "職人詳細（プロフィール動画の欄）", async () => {
        await page.goto(`${BASE}/users/contractors/${CONTRACTOR_ID}`);
        await page.getByRole("heading", { name: "ユーザー詳細" }).waitFor();
      });
      await step(page, this, "自社の発注者情報詳細（プロフィール動画の欄）", async () => {
        await page.goto(`${BASE}/mypage/client-profile`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      });
    },
  },
  {
    id: "F4",
    name: "管理画面（銀行振込）: 代理登録 → 申込者控えメール → 請求書送付済 → 有効化 → 会員側ご利用中 → 運営宛メール",
    async run(page) {
      const since = Date.now();
      await step(page, this, "運営ログイン → 銀行振込申込一覧", async () => {
        await adminLogin(page);
        await page.getByRole("link", { name: "銀行振込申込一覧" }).click();
        await page.waitForURL(/\/admin\/bank-transfers/);
      });
      await step(page, this, "申込を登録する（ライト・年払い）: 金額の目安 28,000 円", async () => {
        await page.getByRole("link", { name: "申込を登録する" }).click();
        await page.waitForURL(/\/admin\/bank-transfers\/new/);
        await page.getByLabel("会員のメールアドレス").fill(USERS.bank);
        await page.getByRole("combobox", { name: "お支払いサイクル" }).click();
        await page.getByRole("option", { name: "年払い" }).click();
        await page.getByText(/本体金額の目安/).waitFor();
      });
      await step(page, this, "登録 → 申込詳細（合計 40,000 円 = 28,000 + 事務手数料 12,000）", async () => {
        await page.getByRole("button", { name: "登録する" }).click();
        await page.waitForURL(/\/admin\/bank-transfers\/[0-9a-f-]{36}$/, { timeout: 20000 });
        await page.getByRole("heading", { name: "銀行振込申込詳細" }).waitFor();
      });
      await shotMails(page, this, since, ["銀行振込でのお申し込みを受け付けました"], "申込者控えメール");
      const detailUrl = manifest.filter((m) => m.flow === "F4" && /bank-transfers\/[0-9a-f-]{36}$/.test(m.url ?? "")).at(-1)?.url;
      await step(page, this, "請求書を送付済みにする", async () => {
        if (detailUrl) await page.goto(detailUrl);
        await page.getByRole("button", { name: "請求書を送付済みにする" }).click();
        await page.getByRole("button", { name: "送付済みにする" }).click();
        await page.getByText("請求書送付済みにしました").waitFor();
      });
      const sinceActivate = Date.now();
      await step(page, this, "入金を確認して有効化する（利用開始日 = 本日）", async () => {
        await page.getByRole("button", { name: "入金を確認して有効化する" }).click();
        const dialog = page.getByRole("dialog", { name: "入金を確認して有効化する" });
        await dialog.getByLabel("利用開始日").waitFor();
        await dialog.getByRole("button", { name: "有効化する" }).click();
        await page.getByText(/有効化しました（有効期限/).waitFor({ timeout: 20000 });
      });
      await step(page, this, "アカウント詳細（ADM-004）: プラン: ライト（銀行振込・年払い）", async () => {
        await page.getByRole("link", { name: "アカウント詳細を見る" }).click();
        await page.waitForURL(/\/admin\/clients\//);
        await page.getByText(/プラン: ライト（銀行振込・年払い）/).waitFor();
      });
      await shotMails(page, this, sinceActivate, ["プランのお申し込みを承りました"], "会員宛: プランのお申し込みを承りました");
      await shotMails(page, this, sinceActivate, ["プランの新規お申し込みがありました"], "運営宛: プランの新規お申し込みがありました（P11 新設）");
      await step(page, this, "会員側: 料金プラン画面で「ご利用中」「銀行振込（年払い）」", async () => {
        await page.context().clearCookies();
        await login(page, USERS.bank);
        await page.goto(`${BASE}/billing`);
        await page.getByText("ご利用中").first().waitFor();
      });
    },
  },
  {
    id: "F5",
    name: "管理画面（動画）: 動画管理のタブ → URL で追加 → 会員画面に「プロフィール動画」 → 掲載完了メール → 削除",
    async run(page) {
      const since = Date.now();
      await step(page, this, "運営ログイン → ユーザー詳細（contractor3）→「動画を投稿/編集する」", async () => {
        await adminLogin(page);
        await page.goto(`${BASE}/admin/users/${CONTRACTOR3_ID}`);
        await page.getByRole("link", { name: "動画を投稿/編集する" }).click();
        await page.waitForURL(/\/videos\?placement=contractor_page/);
        await page.getByRole("heading", { name: "ユーザー動画管理" }).waitFor();
      });
      await step(page, this, "会社ページ側のタブに切替（タブ名 = 画面名）", async () => {
        await page.getByRole("tab", { name: "発注者情報詳細（発注者詳細）" }).click();
        await page.waitForTimeout(300);
        await page.getByRole("tab", { name: "ユーザープロフィール（ユーザー詳細）" }).click();
      });
      await step(page, this, "URL で動画を追加（0 本 → 1 本 = 掲載完了メールが出る条件）", async () => {
        const tab = page.getByRole("tabpanel");
        await tab.getByLabel("URL").fill("https://www.tiktok.com/@bijiyu/video/7999999999999999998");
        await tab.getByLabel("管理用ラベル（任意）").last().fill("操作確認 追加");
        await tab.getByRole("button", { name: "URL で追加" }).click();
        await page.getByText("動画を追加しました").waitFor({ timeout: 20000 });
      });
      await shotMails(page, this, since, ["動画の掲載が完了しました"], "会員宛: 動画の掲載が完了しました（掲載先: ユーザー詳細ページ）");
      await shotMails(page, this, since, ["掲載完了を申込者へ通知しました"], "運営宛: 掲載完了の控え");
      await step(page, this, "会員側（発注者視点）: 職人詳細に「プロフィール動画」として表示", async () => {
        await page.context().clearCookies();
        await login(page, USERS.client);
        await page.goto(`${BASE}/users/contractors/${CONTRACTOR3_ID}`);
        await page.getByRole("heading", { name: "プロフィール動画" }).waitFor();
      });
      await step(page, this, "運営: 追加した動画を削除", async () => {
        await page.context().clearCookies();
        await adminLogin(page);
        await page.goto(`${BASE}/admin/users/${CONTRACTOR3_ID}/videos?placement=contractor_page`);
        await page.getByRole("button", { name: "操作確認 追加を削除" }).click();
        await page.getByRole("button", { name: "削除する" }).click();
        await page.getByText("動画を削除しました").waitFor({ timeout: 20000 });
      });
    },
  },
  {
    id: "F6",
    name: "管理画面（一覧）: オプション絞り込み（プロフィール動画 / ユーザー撮影プラン / ビジ友公式SNS動画）と発注者詳細",
    async run(page) {
      await step(page, this, "運営ログイン → ユーザーアカウント一覧", async () => {
        await adminLogin(page);
        await page.goto(`${BASE}/admin/users`);
        await page.getByRole("heading", { name: "ユーザーアカウント一覧" }).waitFor();
      });
      await step(page, this, "絞り込みの選択肢を開く", async () => {
        await page.getByRole("combobox").first().click();
        await page.getByRole("option", { name: "ビジ友公式SNS動画" }).waitFor();
      }, { fullPage: false });
      await step(page, this, "「プロフィール動画」で検索（video + 旧 video_workplace の購入者）", async () => {
        await page.getByRole("option", { name: "プロフィール動画" }).click();
        await page.getByRole("button", { name: "検索" }).click();
        await page.waitForURL(/option=video/);
        await page.getByText(/検索結果：/).waitFor();
      });
      await step(page, this, "発注者アカウント一覧（絞り込み: プロフィール動画 / バッジ）", async () => {
        await page.goto(`${BASE}/admin/clients?option=video`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      });
      await step(page, this, "発注者アカウント詳細（オプション加入状況・プロフィール動画・動画ボタン）", async () => {
        await page.goto(`${BASE}/admin/clients/${CLIENT_ID}`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      });
      await step(page, this, "ユーザーアカウント詳細（プロフィール動画・動画ボタン）", async () => {
        await page.goto(`${BASE}/admin/users/${CONTRACTOR_ID}`);
        await page.getByRole("heading", { name: "ユーザーアカウント詳細" }).waitFor();
      });
    },
  },
  {
    id: "F7",
    name: "担当者の上限（プレミアム = 5 人）: 5 人目は登録でき、6 人目はエラー",
    async run(page) {
      await step(page, this, "Owner でログイン → 担当者一覧（現在 4 名）", async () => {
        await login(page, USERS.client);
        await page.goto(`${BASE}/mypage/members`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      });
      for (const [n, label] of [[5, "5 人目（登録できる）"], [6, "6 人目（上限エラー）"]]) {
        await step(page, this, `担当者新規作成: ${label} 入力 → 確認`, async () => {
          await page.goto(`${BASE}/mypage/members/new`);
          await page.getByRole("heading", { name: "担当者新規作成" }).waitFor();
          await page.getByPlaceholder("田中").fill("操作確認");
          await page.getByPlaceholder("一郎").fill(`担当${n}`);
          await page.locator("#email").fill(`capture-member-${n}-${Date.now()}@test.local`);
          await page.getByRole("button", { name: "入力内容を確認する" }).click();
          await page.getByRole("button", { name: "送信する" }).waitFor();
        });
        await step(page, this, `送信 → ${label}`, async () => {
          await page.getByRole("button", { name: "送信する" }).click();
          if (n === 5) {
            await page.waitForURL(/\/mypage\/members(\?|$)/, { timeout: 20000 });
          } else {
            await page.getByText(/担当者の上限（5人）に達しています/).waitFor({ timeout: 20000 });
          }
        });
      }
    },
  },
];

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
async function buildPdf(browser) {
  const escape = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const flowsById = new Map(FLOWS.map((f) => [f.id, f]));
  const sections = [];
  for (const [id, flow] of flowsById) {
    const items = manifest.filter((m) => m.flow === id);
    if (items.length === 0) continue;
    const errors = items.filter((m) => m.status === "error").length;
    const pages = items
      .map((m) => {
        const img = m.file ? `<img src="file://${join(PNG, m.file)}" />` : "";
        return `<section class="page">
  <h2>${escape(id)}-${pad(m.seq)} ${escape(m.title)} ${m.status === "error" ? '<span class="ng">✗ 失敗</span>' : '<span class="ok">✓</span>'}</h2>
  <p class="meta">${escape(m.url ?? "")}${m.error ? `<br><span class="err">${escape(m.error)}</span>` : ""}</p>
  ${img}
</section>`;
      })
      .join("\n");
    sections.push(`<section class="page cover"><h1>${escape(id)}. ${escape(flow.name)}</h1><p>${items.length} ステップ / 失敗 ${errors}</p></section>\n${pages}`);
  }
  const total = manifest.length;
  const failed = manifest.filter((m) => m.status === "error").length;
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, "Hiragino Sans", sans-serif; margin: 0; }
  .page { page-break-after: always; padding: 24px; }
  .cover { display: flex; flex-direction: column; justify-content: center; min-height: 90vh; }
  h1 { font-size: 22px; } h2 { font-size: 14px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 10px; margin: 0 0 8px; word-break: break-all; }
  .ok { color: #2a7; } .ng { color: #c33; } .err { color: #c33; }
  img { max-width: 100%; border: 1px solid #ddd; }
  ul { font-size: 12px; }
</style></head><body>
<section class="page cover">
  <h1>ビジ友 操作確認スクリーンショット集（P10 動画プラン整理 / P11 価格改定 後）</h1>
  <p>${escape(new Date().toLocaleString("ja-JP"))} / ${escape(BASE)} / ${total} ステップ、失敗 ${failed}</p>
  <ul>${FLOWS.filter((f) => manifest.some((m) => m.flow === f.id)).map((f) => `<li>${escape(f.id)}. ${escape(f.name)}（失敗 ${manifest.filter((m) => m.flow === f.id && m.status === "error").length}）</li>`).join("")}</ul>
</section>
${sections.join("\n")}
</body></html>`;
  const htmlPath = join(OUT, "flows.html");
  await writeFile(htmlPath, html, "utf8");
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`);
  await page.pdf({ path: join(OUT, "ビジ友_操作確認集.pdf"), format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
  await page.close();
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(PNG, { recursive: true });
  const browser = await chromium.launch(
    process.env.CAPTURE_CHROMIUM_PATH ? { executablePath: process.env.CAPTURE_CHROMIUM_PATH } : {},
  );
  for (const flow of FLOWS) {
    if (ONLY.length > 0 && !ONLY.includes(flow.id)) continue;
    console.log(`▶ ${flow.id} ${flow.name}`);
    const { ctx, page } = await newContext(browser);
    try {
      await flow.run(page);
    } catch (err) {
      console.log(`  ✗ ${flow.id} aborted: ${String(err).split("\n")[0]}`);
      manifest.push({ seq: ++seq, flow: flow.id, flowName: flow.name, title: "フロー中断", status: "error", error: String(err).slice(0, 300) });
    } finally {
      await ctx.close();
    }
  }
  await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await buildPdf(browser);
  await browser.close();
  const failed = manifest.filter((m) => m.status === "error");
  console.log(`\n完了: ${manifest.length} ステップ、失敗 ${failed.length}`);
  for (const f of failed) console.log(`  ✗ ${f.flow} ${f.title}: ${f.error}`);
  console.log(`PDF: ${join(OUT, "ビジ友_操作確認集.pdf")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
