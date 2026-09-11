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
  manifest.push({ seq, flow: flow.id, flowName: flow.name, title, desc: opts.desc ?? "", status: opts.status ?? "ok", file, url: page.url(), note: opts.note ?? "", error: opts.error ?? "" });
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
async function shotMails(page, flow, sinceMs, subjectIncludes, title, desc = "") {
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
    await shot(page, flow, `${title}: 宛先 ${h.to} / 件名 ${h.subject}`, { mail: true, note: h.to, desc });
  }
}

// ---------------------------------------------------------------------------
// フロー定義
// ---------------------------------------------------------------------------
const FLOWS = [
  {
    id: "F1",
    name: "職人（無料）: 案件検索 → 応募 → 応募履歴 → メッセージ送信",
    intro: {
      user: "contractor@test.local（無料プラン・受注者。対応職種: 大工・木工 / 対応エリア: 東京都・神奈川県・千葉県）",
      precondition: "seed 投入直後（この案件にはまだ応募していない）",
      expect: "無料会員が登録職種 × 登録県に合う案件へ応募でき、応募履歴に載り、既存スレッドでメッセージを送れる。今回の変更（一覧の並び順）で案件検索が壊れていないこと",
    },
    async run(page) {
      await step(page, this, "ログイン → マイページ", () => login(page, USERS.contractor),
        { desc: "操作: /login でメールアドレスとパスワードを入力し「ログイン」。\n確認: マイページに遷移する。" });
      await step(page, this, "案件一覧（おすすめ順）", async () => {
        await page.goto(`${BASE}/jobs/search`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      }, { desc: "操作: 募集案件一覧（/jobs/search）を開く。並び替えは既定の「おすすめ順」。\n確認: 急募 → ハイエンド → プレミアム → スタンダード → その他（各グループ内は新着順）の順に並ぶ（P11 でスタンダードを上位表示に追加）。" });
      await step(page, this, "案件詳細（東京都内マンション内装仕上げ工事）", async () => {
        await page.goto(`${BASE}/jobs/${JOB_FOR_APPLY}`);
        await page.getByRole("link", { name: "応募する" }).first().waitFor();
      }, { desc: "操作: 木工・東京都の案件の詳細を開く。\n確認: この職人の職種・エリアに合致するため「応募する」ボタンが活性で表示される（無料会員の応募制限の確認）。" });
      await step(page, this, "応募フォーム入力", async () => {
        await page.getByRole("link", { name: "応募する" }).first().click();
        await page.waitForURL(/\/apply$/);
        await page.getByPlaceholder("人数を入力").fill("1");
        await page.getByPlaceholder("日程/働き方を入力").fill("平日 8:00〜17:00 で対応可能です");
        await page.locator("input[type='date']").first().fill(futureDate(14));
        await page.getByPlaceholder("申し送り事項があれば入力").fill("操作確認のための応募です");
        await page.getByLabel("上記内容を確認しました").check();
      }, { desc: "操作: 「応募する」→ 応募フォームで 応募人数 1 / 日程・働き方 / 初回稼働希望日（14 日後）/ 申し送り を入力し、「上記内容を確認しました」にチェック。\n確認: 入力内容がフォームに反映されている。" });
      await step(page, this, "応募内容の確認ダイアログ", async () => {
        await page.getByRole("button", { name: "応募する" }).click();
        await page.getByRole("dialog").waitFor();
      }, { fullPage: false, desc: "操作: フォーム下の「応募する」を押す。\n確認: 入力内容の確認ダイアログが開く。" });
      await step(page, this, "確認 OK → 「応募が完了しました」", async () => {
        await page.getByRole("dialog").getByRole("button", { name: "OK" }).click();
        await page.getByText("応募が完了しました").waitFor({ timeout: 20000 });
      }, { fullPage: false, desc: "操作: 確認ダイアログの「OK」を押す（ここで応募が DB に保存され、発注者へ応募通知メールが送られる）。\n確認: 「応募が完了しました」のダイアログが出る。" });
      await step(page, this, "完了 OK → 応募履歴", async () => {
        await page.getByRole("dialog").getByRole("button", { name: "OK" }).click();
        await page.waitForURL(/\/applications\/history/, { timeout: 20000 });
      }, { desc: "操作: 完了ダイアログの「OK」を押す。\n確認: 応募履歴（/applications/history）に遷移し、今応募した案件が一覧に載る。" });
      await step(page, this, "メッセージ詳細（中村リフォーム）を開く", async () => {
        await page.goto(`${BASE}/messages/${MSG_THREAD}`);
        await page.getByText("中村リフォーム").first().waitFor();
      }, { desc: "操作: seed の既存スレッド（相手: 中村リフォーム）を開く。\n確認: 相手名と過去のメッセージが表示される。" });
      await step(page, this, "メッセージ送信（画面に即時反映）", async () => {
        const text = `操作確認メッセージ ${new Date().toLocaleTimeString("ja-JP")}`;
        await page.locator("textarea[placeholder='メッセージ']").fill(text);
        await page.locator("button.rounded-full.bg-primary").last().click();
        await page.getByText(text).waitFor();
      }, { desc: "操作: 入力欄に「操作確認メッセージ + 時刻」を入力し、送信ボタン（紙飛行機アイコン）を押す。\n確認: 送ったメッセージが自分側の吹き出しとして画面に出る。" });
    },
  },
  {
    id: "F2",
    name: "発注者（プレミアム）: 料金プラン → 比較表 → 案件作成 → 応募一覧 → 発注可否（発注を依頼する）",
    intro: {
      user: "client@test.local（プレミアムプラン・月払い・法人 Owner「鈴木工務店株式会社」。旧 職場紹介動画を購入済み）",
      precondition: "seed 投入直後。応募 bbbe（contractor4 → 千葉案件）が「応募中」",
      expect: "料金プラン画面と比較表に P10/P11 の変更（新価格・動画 3 プラン・注意書き・新しい行）が出る。発注者の基本操作（案件作成・発注可否）が壊れていない",
    },
    async run(page) {
      await step(page, this, "ログイン → マイページ", () => login(page, USERS.client),
        { desc: "操作: 発注者でログイン。\n確認: マイページに遷移し、発注者向けメニューが出る。" });
      await step(page, this, "料金プラン画面（新価格・動画 3 プラン・注意書き）", async () => {
        await page.goto(`${BASE}/billing`);
        await page.getByText("オプションプラン").first().waitFor();
      }, { desc: "操作: 料金プラン画面（/billing）を開く。\n確認: 基本プランの月額が 2,800 / 9,800 / 28,000 / 168,000 円、プレミアムに「ご利用中」。初回事務手数料の文言が 12,000 円。オプションが「プロフィール動画制作プラン（購入済み。旧 職場紹介動画の購入を引き継ぐ）/ ユーザー撮影プラン / ビジ友公式SNS動画制作プラン / 急募」の順で、旧「自己PR動画掲載」「職場紹介動画掲載」の行が無い。交通費・プラン付属の注意書きが出る。" });
      await step(page, this, "年払いタブに切替（年額 = 月額 × 10）", async () => {
        await page.getByRole("tab", { name: "年払い" }).click();
        await page.waitForTimeout(300);
      }, { desc: "操作: 「年払い」タブを押す。\n確認: 各プランの金額が年額（28,000 / 98,000 / 280,000 / 1,680,000 円/年 = 月額 × 10 の暫定）に切り替わる。" });
      await step(page, this, "「こちら」→ プラン比較表", async () => {
        await page.getByRole("link", { name: "こちら" }).click();
        await page.waitForURL(/\/billing\/plans$/);
        await page.getByRole("heading", { name: "プラン一覧" }).waitFor();
      }, { desc: "操作: 基本プランの説明文中の「こちら」リンクを押す。\n確認: プラン一覧（比較表）に遷移。月額・年額の 2 行、案件募集機能（ライト以上 ○）、現場掲載（ライト「1件まで」）、検索機能（無料 ○）、上位表示（スタンダード以上 ○）、複数人利用（5 人 / 30 人）、サポート担当（スカウト）、代理メッセージ（24 通 / 300 通）、プロフィール動画制作、ビジ友公式SNS動画制作（年払いのみ ○）。表の下にオプション価格表。" });
      await step(page, this, "マイページ → 募集現場一覧 → 新規作成", async () => {
        await page.goto(`${BASE}/mypage`);
        await page.getByRole("link", { name: "募集現場一覧" }).click();
        await page.waitForURL(/\/jobs\/manage/);
        await page.getByRole("link", { name: "新規作成" }).click();
        await page.waitForURL(/\/jobs\/create/);
      }, { desc: "操作: マイページの「募集現場一覧」→「新規作成」とクリックで辿る（導線の確認）。\n確認: 案件作成フォームが開く。" });
      await step(page, this, "案件を下書き保存（タイトルのみ）", async () => {
        await page.getByPlaceholder("案件タイトルを入力").fill(`操作確認 下書き案件 ${Date.now()}`);
        await page.getByRole("button", { name: "下書き保存" }).click();
        await page.getByText("案件を作成しました").waitFor({ timeout: 20000 });
      }, { desc: "操作: タイトルだけ入力して「下書き保存」。\n確認: 「案件を作成しました」が出て案件管理画面（CLI-002）に遷移する。プレミアム（現場掲載 無制限）なので件数制限に当たらない。" });
      await step(page, this, "応募一覧（未対応）", async () => {
        await page.goto(`${BASE}/applications/received`);
        await page.getByRole("heading", { name: "応募一覧" }).waitFor();
      }, { desc: "操作: 応募一覧（/applications/received）を開く。\n確認: 「応募中」の応募が一覧に出る（F1 で職人が応募した案件は別の発注者のものなのでここには出ない）。" });
      await step(page, this, "発注可否: 「発注を依頼する」+ 初回稼働日 + 勤務地を入力", async () => {
        await page.goto(`${BASE}/applications/received/${APPLICATION_FOR_ACCEPT}/decide`);
        await page.getByRole("heading", { name: "発注可否" }).waitFor();
        await page.getByRole("combobox").click();
        await page.getByRole("option", { name: "発注を依頼する" }).click();
        const dateInput = page.locator("input[type='date']");
        await dateInput.waitFor();
        await dateInput.fill(futureDate(14));
        await page.getByPlaceholder("東京都千代田区丸の内XX-XX").fill("東京都港区操作確認1-2-3");
      }, { desc: "操作: 応募 bbbe の発注可否画面を開き、プルダウンで「発注を依頼する」を選ぶ → 初回稼働日（14 日後）と勤務地（番地）を入力。\n確認: 選択に応じて初回稼働日・勤務地の入力欄が同一画面内に現れる。" });
      await step(page, this, "送信 → 結果送信ダイアログ", async () => {
        await page.getByRole("button", { name: "送信する" }).click();
        await page.getByText("ユーザーへ結果を送信しました").waitFor({ timeout: 20000 });
      }, { fullPage: false, desc: "操作: 「送信する」を押す（応募が「発注済み」になり、職人へ通知メールが送られる）。\n確認: 「ユーザーへ結果を送信しました」のダイアログ。" });
      await step(page, this, "OK → 応募一覧に戻る → 発注履歴", async () => {
        await page.getByRole("button", { name: "OK" }).click();
        await page.waitForURL(/\/applications\/received$/);
        await page.goto(`${BASE}/applications/orders`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      }, { desc: "操作: 「OK」→ 応募一覧に戻ったあと、発注履歴（/applications/orders）を開く。\n確認: 今発注した応募が「発注済み」として発注履歴に載る（応募一覧からは消える）。" });
    },
  },
  {
    id: "F3",
    name: "一覧の並び順と動画欄: 発注者一覧 / 発注者詳細 / 職人一覧 / 職人詳細",
    intro: {
      user: "前半: contractor@test.local（職人）/ 後半: client@test.local（発注者）",
      precondition: "seed 投入直後（ハイエンド建設株式会社 = ハイエンド、鈴木工務店株式会社 = プレミアム、振込商店・client2 = スタンダード）",
      expect: "一覧がプラン順（ハイエンド → プレミアム → スタンダード → その他）で並び、各詳細画面の動画欄の見出しが「プロフィール動画」になっている（旧「PR動画」「職場紹介動画」が残っていない）",
    },
    async run(page) {
      await step(page, this, "職人でログイン → 発注者一覧", async () => {
        await login(page, USERS.contractor);
        await page.goto(`${BASE}/clients`);
        await page.getByLabel("並び替え").waitFor();
      }, { desc: "操作: 職人でログインし、発注者一覧（/clients）を「おすすめ順」で開く。\n確認: 先頭がハイエンド建設株式会社（ハイエンド）、次が鈴木工務店株式会社ほかプレミアム、その後にスタンダード → その他。" });
      await step(page, this, "発注者詳細（プロフィール動画の欄）", async () => {
        await page.goto(`${BASE}/clients/${CLIENT_ID}`);
        await page.getByRole("heading", { name: "発注者詳細" }).waitFor();
      }, { desc: "操作: 鈴木工務店株式会社の発注者詳細を開く。\n確認: 動画欄の見出しが「プロフィール動画」（旧「職場紹介動画」）。動画が再生ボタン付きで表示される。" });
      await step(page, this, "自分のプロフィール（プロフィール動画の欄）", async () => {
        await page.goto(`${BASE}/profile`);
        await page.getByRole("heading", { name: "ユーザープロフィール" }).waitFor();
      }, { desc: "操作: 自分のユーザープロフィール（/profile）を開く。\n確認: 動画欄の見出しが「プロフィール動画」（旧「PR動画」）。" });
      await step(page, this, "発注者でログイン → 職人一覧", async () => {
        await page.context().clearCookies();
        await login(page, USERS.client);
        await page.goto(`${BASE}/users/contractors`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      }, { desc: "操作: いったんログアウト（Cookie 削除）し、発注者でログインして職人一覧（/users/contractors）を開く。\n確認: 職人一覧が表示される（こちらは新着順のまま。プラン順は適用しない）。" });
      await step(page, this, "職人詳細（プロフィール動画の欄）", async () => {
        await page.goto(`${BASE}/users/contractors/${CONTRACTOR_ID}`);
        await page.getByRole("heading", { name: "ユーザー詳細" }).waitFor();
      }, { desc: "操作: contractor@test.local の職人詳細（ユーザー詳細）を開く。\n確認: 動画欄の見出しが「プロフィール動画」。" });
      await step(page, this, "自社の発注者情報詳細（プロフィール動画の欄）", async () => {
        await page.goto(`${BASE}/mypage/client-profile`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      }, { desc: "操作: マイページの発注者情報詳細（/mypage/client-profile）を開く。\n確認: 自社ページの動画欄も「プロフィール動画」。" });
    },
  },
  {
    id: "F4",
    name: "管理画面（銀行振込）: 代理登録 → 申込者控えメール → 請求書送付済 → 有効化 → 会員側ご利用中 → 運営宛メール",
    intro: {
      user: "admin@test.local（運営）/ 会員側の確認は bank-transfer-e2e@test.local（振込一郎・無料プラン・契約歴なし）",
      precondition: "seed 投入直後。会員本人の「銀行振込で申し込む」ボタンは既定で非表示（P9）なので、申込は運営の代理登録から始まる",
      expect: "代理登録 → 有効化の一連の操作で、新価格（ライト年払い 28,000 円 + 初回事務手数料 12,000 円 = 40,000 円）が正しく計算され、会員宛・運営宛のメール（P11 新設の運営宛を含む）が生成され、会員側でプランが有効になる",
    },
    async run(page) {
      const since = Date.now();
      await step(page, this, "運営ログイン → 銀行振込申込一覧", async () => {
        await adminLogin(page);
        await page.getByRole("link", { name: "銀行振込申込一覧" }).click();
        await page.waitForURL(/\/admin\/bank-transfers/);
      }, { desc: "操作: 管理画面（/admin/login）にログインし、ダッシュボードの「銀行振込申込一覧」をクリック。\n確認: 申込一覧（ADM-025）が開く。seed の既存申込が並ぶ。" });
      await step(page, this, "申込を登録する（ライト・年払い）", async () => {
        await page.getByRole("link", { name: "申込を登録する" }).click();
        await page.waitForURL(/\/admin\/bank-transfers\/new/);
        await page.getByLabel("会員のメールアドレス").fill(USERS.bank);
        await page.getByRole("combobox", { name: "お支払いサイクル" }).click();
        await page.getByRole("option", { name: "年払い" }).click();
        await page.getByText(/本体金額の目安/).waitFor();
      }, { desc: "操作: 「申込を登録する」→ 会員のメールアドレスに振込一郎を入力、対象 = 基本プラン（既定）/ プラン = ライト（既定）/ お支払いサイクルを「年払い」に変更。\n確認: 本体金額の目安が 28,000 円（新価格 2,800 × 10）と表示される。" });
      await step(page, this, "登録 → 申込詳細（合計 40,000 円）", async () => {
        await page.getByRole("button", { name: "登録する" }).click();
        await page.waitForURL(/\/admin\/bank-transfers\/[0-9a-f-]{36}$/, { timeout: 20000 });
        await page.getByRole("heading", { name: "銀行振込申込詳細" }).waitFor();
      }, { desc: "操作: 「登録する」を押す。\n確認: 申込詳細（ADM-026）に遷移し「ライトプラン（年払い）を登録しました」。本体価格 28,000 円 + 初回事務手数料 12,000 円（契約歴なしのため加算）= 請求合計 40,000 円。状態は「申込受付」、運営メモに「運営が代理登録」。" });
      await shotMails(page, this, since, ["銀行振込でのお申し込みを受け付けました"], "申込者控えメール",
        "登録した瞬間に会員（振込一郎）へ自動送信されるメール。ローカルでは /tmp/bijiyu-dev-mail に HTML として書き出されたものを表示。\n確認: 件名「【ビジ友】銀行振込でのお申し込みを受け付けました」、お申し込み内容「ライトプラン（年払い）」、「請求書をお送りします」の案内。運営宛の通知はこのとき送られない（運営自身が登録したため）。");
      const detailUrl = manifest.filter((m) => m.flow === "F4" && /bank-transfers\/[0-9a-f-]{36}$/.test(m.url ?? "")).at(-1)?.url;
      await step(page, this, "請求書を送付済みにする", async () => {
        if (detailUrl) await page.goto(detailUrl);
        await page.getByRole("button", { name: "請求書を送付済みにする" }).click();
        await page.getByRole("button", { name: "送付済みにする" }).click();
        await page.getByText("請求書送付済みにしました").waitFor();
      }, { desc: "操作: 申込詳細で「請求書を送付済みにする」→ 確認ダイアログで「送付済みにする」（実際の請求書送付はアプリ外）。\n確認: 状態が「請求書送付済」になる。" });
      const sinceActivate = Date.now();
      await step(page, this, "入金を確認して有効化する（利用開始日 = 本日）", async () => {
        await page.getByRole("button", { name: "入金を確認して有効化する" }).click();
        const dialog = page.getByRole("dialog", { name: "入金を確認して有効化する" });
        await dialog.getByLabel("利用開始日").waitFor();
        await dialog.getByRole("button", { name: "有効化する" }).click();
        await page.getByText(/有効化しました（有効期限/).waitFor({ timeout: 20000 });
      }, { desc: "操作: 「入金を確認して有効化する」→ ダイアログで利用開始日（既定 = 本日）のまま「有効化する」（入金確認はアプリ外）。\n確認: 「有効化しました（有効期限 …）」が出て状態が「入金確認済」。操作ボタンが消え、「アカウント詳細を見る」の案内に変わる。この瞬間に会員宛・運営宛メールが送られる。" });
      await step(page, this, "アカウント詳細（ADM-004）: プラン: ライト（銀行振込・年払い）", async () => {
        await page.getByRole("link", { name: "アカウント詳細を見る" }).click();
        await page.waitForURL(/\/admin\/clients\//);
        await page.getByText(/プラン: ライト（銀行振込・年払い）/).waitFor();
      }, { desc: "操作: 「アカウント詳細を見る」を押す。\n確認: 発注者アカウント詳細（ADM-004）に「プラン: ライト（銀行振込・年払い）」と有効期限、銀行振込の操作パネル（期限を延長する 等）が出る。運営が付属動画の対象を判断するときはこの表示を見る。" });
      await shotMails(page, this, sinceActivate, ["プランのお申し込みを承りました"], "会員宛: プランのお申し込みを承りました",
        "有効化時に会員へ自動送信されるメール（カード決済のときと同じテンプレート）。\n確認: 件名「【ビジ友】プランのお申し込みを承りました」、お申し込みプラン「ライトプラン」、ご利用開始日。");
      await shotMails(page, this, sinceActivate, ["プランの新規お申し込みがありました"], "運営宛: プランの新規お申し込みがありました（P11 新設）",
        "有効化時に運営（OPS_NOTIFICATION_EMAIL）へ自動送信される新設メール。\n確認: 件名「【ビジ友 運営】プランの新規お申し込みがありました」、申込者・会社名・お申し込みプラン「ライトプラン（年払い）」・お支払い方法「銀行振込」・ご利用開始日・発注者アカウント詳細へのリンク。付属動画の判定文言は入っていない（プラン名を見て運営が判断する設計）。");
      await step(page, this, "会員側: 料金プラン画面で「ご利用中」", async () => {
        await page.context().clearCookies();
        await login(page, USERS.bank);
        await page.goto(`${BASE}/billing`);
        await page.getByText("ご利用中").first().waitFor();
      }, { desc: "操作: 運営をログアウトし、振込一郎（会員）でログインして料金プラン画面を開く。\n確認: ライトプランに「ご利用中」「銀行振込（年払い）」と有効期限が表示され、カード決済用のプラン変更・解約ボタンは出ない（銀行振込の契約は運営が管理）。" });
    },
  },
  {
    id: "F5",
    name: "管理画面（動画）: 動画管理のタブ → URL で追加 → 会員画面に「プロフィール動画」 → 掲載完了メール → 削除",
    intro: {
      user: "admin@test.local（運営）/ 会員側の確認は client@test.local（発注者視点）",
      precondition: "対象は contractor3@test.local（渡辺大輔）。動画が 0 本なので、1 本目の登録で掲載完了メールが出る条件（その掲載先で公開中が 0 → 1 本）を満たす",
      expect: "ADM-027 のタブ名が画面名（ユーザープロフィール（ユーザー詳細）/ 発注者情報詳細（発注者詳細））になり、URL 登録 → 会員画面への表示 → 掲載完了メール（【掲載先】表記）→ 削除が通る",
    },
    async run(page) {
      const since = Date.now();
      await step(page, this, "運営ログイン → ユーザー詳細（contractor3）→「動画を投稿/編集する」", async () => {
        await adminLogin(page);
        await page.goto(`${BASE}/admin/users/${CONTRACTOR3_ID}`);
        await page.getByRole("link", { name: "動画を投稿/編集する" }).click();
        await page.waitForURL(/\/videos\?placement=contractor_page/);
        await page.getByRole("heading", { name: "ユーザー動画管理" }).waitFor();
      }, { desc: "操作: 管理画面にログインし、渡辺大輔のユーザーアカウント詳細（ADM-009）から「動画を投稿/編集する」（旧「受注者PR動画を投稿/編集する」）を押す。\n確認: ユーザー動画管理（ADM-027）が職人ページ側のタブで開き、登録済み 0 本。" });
      await step(page, this, "会社ページ側のタブに切替 → 職人ページ側に戻す（タブ名 = 画面名）", async () => {
        await page.getByRole("tab", { name: "発注者情報詳細（発注者詳細）" }).click();
        await page.waitForTimeout(300);
        await page.getByRole("tab", { name: "ユーザープロフィール（ユーザー詳細）" }).click();
      }, { desc: "操作: タブ「発注者情報詳細（発注者詳細）」を押し、続けて「ユーザープロフィール（ユーザー詳細）」に戻す。\n確認: タブ名が旧「受注者PR動画 / 職場紹介動画」ではなく画面名になっている。タブの下に掲載先の説明。Cloudflare 未設定のローカルでは MP4 アップロードが無効化され、URL 登録のみ使える旨が表示される。" });
      await step(page, this, "URL で動画を追加（0 本 → 1 本）", async () => {
        const tab = page.getByRole("tabpanel");
        await tab.getByLabel("URL").fill("https://www.tiktok.com/@bijiyu/video/7999999999999999998");
        await tab.getByLabel("管理用ラベル（任意）").last().fill("操作確認 追加");
        await tab.getByRole("button", { name: "URL で追加" }).click();
        await page.getByText("動画を追加しました").waitFor({ timeout: 20000 });
      }, { desc: "操作: 「URL で追加」欄に TikTok の URL と管理用ラベル「操作確認 追加」を入力し「URL で追加」。\n確認: 「動画を追加しました」が出て登録済み 1 本になる。0 → 1 本なので会員宛・運営宛の掲載完了メールが送られる。" });
      await shotMails(page, this, since, ["動画の掲載が完了しました"], "会員宛: 動画の掲載が完了しました",
        "追加直後に会員（渡辺大輔）へ自動送信されるメール。\n確認: 件名「【ビジ友】動画の掲載が完了しました」、【掲載先】ユーザー詳細ページ（P10 で「動画種別」から変更）、掲載完了日。");
      await shotMails(page, this, since, ["掲載完了を申込者へ通知しました"], "運営宛: 掲載完了の控え",
        "同時に運営へ送られる控え。\n確認: 申込者・掲載先「ユーザー詳細ページ」・掲載完了日時・管理画面へのリンク。");
      await step(page, this, "会員側（発注者視点）: 職人詳細に「プロフィール動画」として表示", async () => {
        await page.context().clearCookies();
        await login(page, USERS.client);
        await page.goto(`${BASE}/users/contractors/${CONTRACTOR3_ID}`);
        await page.getByRole("heading", { name: "プロフィール動画" }).waitFor();
      }, { desc: "操作: 運営をログアウトし、発注者でログインして渡辺大輔のユーザー詳細を開く。\n確認: 「プロフィール動画」の見出しで、今登録した動画が再生ボタン付きで表示される（購入の有無に関係なく表示される P4 の方針どおり）。" });
      await step(page, this, "運営: 追加した動画を削除", async () => {
        await page.context().clearCookies();
        await adminLogin(page);
        await page.goto(`${BASE}/admin/users/${CONTRACTOR3_ID}/videos?placement=contractor_page`);
        await page.getByRole("button", { name: "操作確認 追加を削除" }).click();
        await page.getByRole("button", { name: "削除する" }).click();
        await page.getByText("動画を削除しました").waitFor({ timeout: 20000 });
      }, { desc: "操作: 再度運営でログインし、動画管理で「操作確認 追加」の削除ボタン → 確認ダイアログで「削除する」。\n確認: 「動画を削除しました」が出て 0 本に戻る。削除ではメールは送られない。" });
    },
  },
  {
    id: "F6",
    name: "管理画面（一覧）: オプション絞り込み（プロフィール動画 / ユーザー撮影プラン / ビジ友公式SNS動画）と発注者詳細",
    intro: {
      user: "admin@test.local（運営）",
      precondition: "seed 投入直後（contractor@test.local = 旧 video、client@test.local = 旧 video_workplace を購入済み）",
      expect: "絞り込みの選択肢が P10 の 3 プラン名になり、「プロフィール動画」で旧 video と旧 video_workplace の購入者がまとめて出る。詳細画面の見出し・ボタン名が新名称",
    },
    async run(page) {
      await step(page, this, "運営ログイン → ユーザーアカウント一覧", async () => {
        await adminLogin(page);
        await page.goto(`${BASE}/admin/users`);
        await page.getByRole("heading", { name: "ユーザーアカウント一覧" }).waitFor();
      }, { desc: "操作: 管理画面にログインし、ユーザーアカウント一覧（ADM-008）を開く。\n確認: キーワードとオプションプラン加入者の絞り込み欄がある。" });
      await step(page, this, "絞り込みの選択肢を開く", async () => {
        await page.getByRole("combobox").first().click();
        await page.getByRole("option", { name: "ビジ友公式SNS動画" }).waitFor();
      }, { fullPage: false, desc: "操作: 「オプションプラン加入者」のプルダウンを開く。\n確認: 選択肢が「すべて / プロフィール動画 / ユーザー撮影プラン / ビジ友公式SNS動画 / 補償¥5,000 / 補償¥9,800」（旧「動画掲載(受注者PR)」が無い）。" });
      await step(page, this, "「プロフィール動画」で検索", async () => {
        await page.getByRole("option", { name: "プロフィール動画" }).click();
        await page.getByRole("button", { name: "検索" }).click();
        await page.waitForURL(/option=video/);
        await page.getByText(/検索結果：/).waitFor();
      }, { desc: "操作: 「プロフィール動画」を選んで「検索」。\n確認: 旧 video（contractor@test.local）と旧 video_workplace（client@test.local）の購入者が両方ヒットする（統合前の購入を同じ商品として扱う）。" });
      await step(page, this, "発注者アカウント一覧（絞り込み: プロフィール動画 / バッジ）", async () => {
        await page.goto(`${BASE}/admin/clients?option=video`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      }, { desc: "操作: 発注者アカウント一覧（ADM-003）をオプション「プロフィール動画」で絞って開く。\n確認: 選択肢が「急募オプション / プロフィール動画」（旧「動画掲載（職場紹介）」が無い）。該当行のバッジが「プロフィール動画」（旧「職場紹介動画」）。" });
      await step(page, this, "発注者アカウント詳細（オプション加入状況・動画欄・ボタン）", async () => {
        await page.goto(`${BASE}/admin/clients/${CLIENT_ID}`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      }, { desc: "操作: 鈴木工務店株式会社の発注者アカウント詳細（ADM-004）を開く。\n確認: オプション加入状況のチェック項目が「プロフィール動画」（旧 video_workplace の購入で ✓）。動画欄の見出しが「プロフィール動画」、ボタンが「動画を投稿/編集する」。プラン表示に支払方法・月払い/年払いが併記される。" });
      await step(page, this, "ユーザーアカウント詳細（動画欄・ボタン）", async () => {
        await page.goto(`${BASE}/admin/users/${CONTRACTOR_ID}`);
        await page.getByRole("heading", { name: "ユーザーアカウント詳細" }).waitFor();
      }, { desc: "操作: contractor@test.local のユーザーアカウント詳細（ADM-009）を開く。\n確認: 動画欄の見出しが「プロフィール動画」、ボタンが「動画を投稿/編集する」（旧「受注者PR動画を投稿/編集する」）。" });
    },
  },
  {
    id: "F7",
    name: "担当者の上限（プレミアム = 5 人）: 5 人目は登録でき、6 人目はエラー",
    intro: {
      user: "client@test.local（プレミアムプラン・法人 Owner）",
      precondition: "seed 投入直後（この法人の担当者は Owner 以外に 4 名）",
      expect: "P11 で 10 人 → 5 人に下げた上限が実際に効く。5 人目は登録でき、6 人目で「担当者の上限（5人）に達しています」と拒否される",
    },
    async run(page) {
      await step(page, this, "Owner でログイン → 担当者一覧（現在 4 名）", async () => {
        await login(page, USERS.client);
        await page.goto(`${BASE}/mypage/members`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
      }, { desc: "操作: 法人 Owner でログインし、担当者一覧（/mypage/members）を開く。\n確認: Owner 以外の担当者が 4 名。「担当者新規登録」ボタンがある。" });
      for (const [n, label] of [[5, "5 人目（登録できる）"], [6, "6 人目（上限エラー）"]]) {
        await step(page, this, `担当者新規作成: ${label} 入力 → 確認`, async () => {
          await page.goto(`${BASE}/mypage/members/new`);
          await page.getByRole("heading", { name: "担当者新規作成" }).waitFor();
          await page.getByPlaceholder("田中").fill("操作確認");
          await page.getByPlaceholder("一郎").fill(`担当${n}`);
          await page.locator("#email").fill(`capture-member-${n}-${Date.now()}@test.local`);
          await page.getByRole("button", { name: "入力内容を確認する" }).click();
          await page.getByRole("button", { name: "送信する" }).waitFor();
        }, { desc: `操作: 担当者新規作成（CLI-025）で 姓「操作確認」名「担当${n}」メールアドレス（一意）権限「担当者」を入力し「入力内容を確認する」。\n確認: 確認画面に入力内容が表示され「送信する」ボタンが出る。` });
        await step(page, this, `送信 → ${label}`, async () => {
          await page.getByRole("button", { name: "送信する" }).click();
          if (n === 5) {
            await page.waitForURL(/\/mypage\/members(\?|$)/, { timeout: 20000 });
          } else {
            await page.getByText(/担当者の上限（5人）に達しています/).waitFor({ timeout: 20000 });
          }
        }, { desc: n === 5
          ? "操作: 「送信する」を押す（招待メールが送られる）。\n確認: 担当者一覧に戻り、5 人目が「招待中」として追加される（上限ちょうどなので登録できる）。"
          : "操作: 同じ手順で 6 人目を「送信する」。\n確認: 「担当者の上限（5人）に達しています。プランのアップグレードをご検討ください」のエラーが出て登録されない（DB 側の上限チェックが 5 で効いている）。" });
      }
    },
  },
];

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
async function buildPdf(browser) {
  const escape = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nl = (s) => escape(s).replace(/\n/g, "<br>");
  const sections = [];
  for (const flow of FLOWS) {
    const items = manifest.filter((m) => m.flow === flow.id);
    if (items.length === 0) continue;
    const errors = items.filter((m) => m.status === "error").length;
    const intro = flow.intro ?? {};
    const toc = items.map((m) => `<li>${pad(m.seq)} ${escape(m.title)}${m.status === "error" ? ' <span class="ng">✗</span>' : ""}</li>`).join("");
    const cover = `<section class="page cover">
  <h1>${escape(flow.id)}. ${escape(flow.name)}</h1>
  <table class="intro">
    <tr><th>使ったユーザー</th><td>${nl(intro.user)}</td></tr>
    <tr><th>前提</th><td>${nl(intro.precondition)}</td></tr>
    <tr><th>期待する結果</th><td>${nl(intro.expect)}</td></tr>
    <tr><th>結果</th><td>${items.length} ステップ中 失敗 ${errors}${errors === 0 ? "（すべて成功）" : ""}</td></tr>
  </table>
  <h3>ステップ</h3><ol class="toc">${toc}</ol>
</section>`;
    const pages = items
      .map((m) => {
        const img = m.file ? `<img src="file://${join(PNG, m.file)}" />` : "";
        return `<section class="page">
  <h2>${escape(flow.id)}-${pad(m.seq)} ${escape(m.title)} ${m.status === "error" ? '<span class="ng">✗ 失敗</span>' : '<span class="ok">✓</span>'}</h2>
  ${m.desc ? `<p class="desc">${nl(m.desc)}</p>` : ""}
  <p class="meta">${escape(m.url ?? "")}${m.error ? `<br><span class="err">${escape(m.error)}</span>` : ""}</p>
  ${img}
</section>`;
      })
      .join("\n");
    sections.push(cover + "\n" + pages);
  }
  const total = manifest.length;
  const failed = manifest.filter((m) => m.status === "error").length;
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, "Hiragino Sans", sans-serif; margin: 0; }
  .page { page-break-after: always; padding: 24px; }
  .cover { min-height: 90vh; }
  h1 { font-size: 20px; } h2 { font-size: 14px; margin: 0 0 6px; } h3 { font-size: 13px; margin: 16px 0 4px; }
  .desc { font-size: 11px; line-height: 1.6; background: #f6f2f8; border-left: 3px solid #8a2b8f; padding: 8px 10px; margin: 0 0 6px; white-space: normal; }
  .meta { color: #666; font-size: 9px; margin: 0 0 8px; word-break: break-all; }
  .ok { color: #2a7; } .ng { color: #c33; } .err { color: #c33; }
  img { max-width: 100%; border: 1px solid #ddd; }
  ul, ol { font-size: 12px; line-height: 1.6; }
  table.intro { border-collapse: collapse; font-size: 12px; margin-top: 12px; }
  table.intro th { text-align: left; background: #f3eef5; padding: 6px 10px; border: 1px solid #ddd; width: 120px; vertical-align: top; }
  table.intro td { padding: 6px 10px; border: 1px solid #ddd; line-height: 1.6; }
  .lead { font-size: 12px; line-height: 1.7; }
</style></head><body>
<section class="page cover">
  <h1>ビジ友 操作確認スクリーンショット集（P10 動画プラン整理 / P11 価格改定 後）</h1>
  <p class="lead">${escape(new Date().toLocaleString("ja-JP"))} / 対象: ${escape(BASE)} / ${total} ステップ、失敗 ${failed}</p>
  <p class="lead">この資料は、seed（テストデータ）を投入した直後の環境で、テストユーザーとして実際に画面を操作し、各ステップの結果を撮影したものです。<br>
  各フローの先頭ページに「使ったユーザー / 前提 / 期待する結果」を、各ステップのページに「操作: 何をしたか」「確認: 画面で何を見るか」を記載しています。<br>
  メールはローカル環境ではファイルに書き出されるため、その HTML を表示して撮影しています（宛先・件名はページ見出しに記載）。<br>
  Stripe のカード決済と Cloudflare への動画アップロードは本物の設定が必要なため、この資料では対象外です（staging 反映後に確認）。</p>
  <h3>フロー一覧</h3>
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
