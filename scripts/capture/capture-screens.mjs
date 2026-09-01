/**
 * ビジ友 全画面キャプチャ自動取得スクリプト
 *
 * 使い方:
 *   1. アプリを起動しておく（ローカル: supabase start + npm run dev）
 *   2. node scripts/capture/capture-screens.mjs
 *
 * 環境変数（省略時はローカル開発環境 + seed ユーザー）:
 *   CAPTURE_BASE_URL   例: https://staging.bijiyuu.net （既定: http://localhost:3000）
 *   CAPTURE_PASSWORD   テストユーザー共通パスワード（既定: testpass123）
 *   CAPTURE_ONLY       特定画面のみ撮る場合: "CON-003,CLI-002" のようにカンマ区切り
 *
 * 出力: scripts/capture/output/png/*.png と manifest.json
 * 注意: 撮影のみでデータは変更しません（フォーム送信・削除等は一切行いません）
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.CAPTURE_BASE_URL || "http://localhost:3000";
const PASSWORD = process.env.CAPTURE_PASSWORD || "testpass123";
const ONLY = (process.env.CAPTURE_ONLY || "").split(",").map(s => s.trim()).filter(Boolean);
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "output");
const PNG = path.join(OUT, "png");
fs.mkdirSync(PNG, { recursive: true });

const USERS = {
  contractor: "contractor@test.local",
  client: "client@test.local",       // 法人プラン Owner（鈴木工務店）
  staff: "staff@test.local",
  admin: "admin@test.local",
};

const PC = { width: 1440, height: 900 };
const SP = { width: 390, height: 844 };

/**
 * 画面定義。
 *  role : none | contractor | client | staff | admin
 *  path : 直接開けるURL
 *  from + pick(+ strip) + suffix : 一覧ページ from を開き、pick に合う最初のリンクの
 *    href を取得 → strip(正規表現)を取り除き → suffix を付けて開く（動的IDの解決）
 *  note : 撮影できない/条件付きの画面の説明（manifest に記録）
 */
const SCREENS = [
  // ---- 認証系 ----
  { id: "AUTH-001", name: "ログイン前TOP", role: "none", path: "/" },
  { id: "AUTH-002", name: "ログイン", role: "none", path: "/login" },
  { id: "AUTH-003", name: "パスワードリセット申請", role: "none", path: "/reset-password" },
  { id: "AUTH-004", name: "パスワード再設定", role: "none", path: "/reset-password/confirm",
    note: "メールのリンク経由が正式な導線。直接アクセス時の表示（期限切れ案内等）を撮影" },
  { id: "AUTH-005", name: "新規会員登録メール認証", role: "none", path: "/register" },
  { id: "AUTH-005B", name: "メール認証の着地画面", role: "none", path: "/register/verify",
    note: "メールのリンク経由が正式な導線。直接アクセス時の表示を撮影" },
  { id: "AUTH-006", name: "新規会員登録情報入力", role: "none", path: "/register/profile",
    note: "メール認証直後のみ入れる画面。未ログイン直アクセス時はリダイレクトされる場合あり" },
  { id: "AUTH-007", name: "新規会員情報登録完了", role: "none", path: "/register/complete",
    note: "登録完了直後のみの画面。直アクセス時はリダイレクトされる場合あり" },
  { id: "AUTH-008", name: "招待承諾・パスワード設定", role: "none", path: "/accept-invite/confirm",
    note: "招待メールのリンク経由が正式な導線。直接アクセス時の表示を撮影" },
  { id: "AUTH-009", name: "メール変更の確認完了", role: "none", path: "/email-change-confirmed",
    note: "確認メールのリンク経由が正式な導線。直接アクセス時の表示を撮影" },

  // ---- 受注者系（contractor でログイン）----
  { id: "CON-001", name: "マイページ", role: "contractor", path: "/mypage" },
  { id: "CON-002", name: "募集案件一覧", role: "contractor", path: "/jobs/search" },
  { id: "CON-003", name: "募集案件詳細", role: "contractor",
    from: "/jobs/search", pick: 'a[href^="/jobs/"]:not([href*="search"]):not([href*="create"]):not([href*="manage"])' },
  { id: "CON-004", name: "応募情報入力", role: "contractor",
    from: "/jobs/search", pick: 'a[href^="/jobs/"]:not([href*="search"]):not([href*="create"]):not([href*="manage"])', suffix: "/apply",
    note: "撮影のみ（応募は送信しません）" },
  { id: "CON-005", name: "発注者一覧", role: "contractor", path: "/clients" },
  { id: "CON-006", name: "発注者詳細", role: "contractor",
    from: "/clients", pick: 'a[href^="/clients/"]' },
  { id: "CON-007", name: "マイリスト", role: "contractor", path: "/favorites" },
  { id: "CON-008", name: "メッセージ/スカウト一覧", role: "contractor", path: "/messages" },
  { id: "CON-009", name: "メッセージ/スカウト詳細", role: "contractor",
    from: "/messages", pick: 'a[href^="/messages/"]:not([href*="new"]):not([href*="bulk"]):not([href*="scout"]):not([href*="template"])' },
  { id: "CON-010", name: "メッセージ入力/送信", skip: "CON-009 の画面内に含まれるため、独立の撮影なし" },
  { id: "CON-011", name: "応募履歴一覧", role: "contractor", path: "/applications/history" },
  { id: "CON-012", name: "応募詳細", role: "contractor",
    from: "/applications/history", pick: 'a[href^="/applications/history/"]' },
  { id: "CON-013", name: "作業報告・評価入力", role: "contractor",
    from: "/applications/history", pick: 'a[href^="/applications/history/"]', suffix: "/report",
    note: "報告可能なステータスの応募がない場合はリダイレクトされることあり" },
  { id: "CON-014", name: "空き日程一覧", role: "contractor", path: "/schedule" },
  { id: "CON-015", name: "空き日程更新", role: "contractor",
    from: "/schedule", pick: 'a[href^="/schedule/"][href$="/edit"]' },
  { id: "CON-016", name: "空き日程登録", role: "contractor", path: "/schedule/new" },

  // ---- 発注者系（client でログイン）----
  { id: "CLI-001", name: "募集現場一覧", role: "client", path: "/jobs/manage" },
  // 注: CLI-001 のカードリンクは /jobs/[id]?manage=true 形式（CLAUDE.md 参照）
  { id: "CLI-002", name: "募集現場詳細", role: "client",
    from: "/jobs/manage", pick: 'a[href^="/jobs/"][href*="manage=true"]' },
  { id: "CLI-003", name: "募集現場編集", role: "client",
    from: "/jobs/manage", pick: 'a[href^="/jobs/"][href*="manage=true"]', strip: /\?.*$/, suffix: "/edit" },
  { id: "CLI-004", name: "募集現場新規登録", role: "client", path: "/jobs/create" },
  { id: "CLI-005", name: "ユーザー一覧（職人一覧）", role: "client", path: "/users/contractors" },
  { id: "CLI-006", name: "ユーザー詳細（職人詳細）", role: "client",
    from: "/users/contractors", pick: 'a[href^="/users/contractors/"]' },
  { id: "CLI-007", name: "応募一覧", role: "client", path: "/applications/received" },
  { id: "CLI-007B", name: "案件応募者一覧", role: "client",
    from: "/jobs/manage", pick: 'a[href^="/jobs/"][href*="manage=true"]', strip: /\?.*$/, suffix: "/applicants" },
  { id: "CLI-008", name: "応募詳細", role: "client",
    from: "/applications/received", pick: 'a[href^="/applications/received/"]',
    note: "未対応の応募が無い場合は撮影できません（B1 実施後に再実行）" },
  { id: "CLI-009", name: "発注可否", role: "client",
    from: "/applications/received", pick: 'a[href^="/applications/received/"]', suffix: "/decide",
    note: "撮影のみ（発注可否は送信しません）" },
  { id: "CLI-010", name: "発注履歴一覧", role: "client", path: "/applications/orders" },
  { id: "CLI-011", name: "発注履歴詳細", role: "client",
    from: "/applications/orders", pick: 'a[href^="/applications/orders/"]' },
  { id: "CLI-012", name: "作業完了/失注報告・評価登録", role: "client",
    from: "/applications/orders", pick: 'a[href^="/applications/orders/"]', suffix: "/report",
    note: "報告可能なステータスの発注がない場合はリダイレクトされることあり" },
  { id: "CLI-013", name: "メッセージ詳細", role: "client",
    from: "/users/contractors", pick: 'a[href^="/users/contractors/"]',
    transform: href => `/messages/new?to=${href.split("/").pop()}`,
    note: "/messages/new はスレッドへ自動リダイレクトされるため、遷移後の画面を撮影" },
  { id: "CLI-014", name: "メッセージ一斉送信", role: "client", path: "/messages/bulk-send" },
  { id: "CLI-015", name: "スカウト送信", role: "client",
    from: "/users/contractors", pick: 'a[href^="/users/contractors/"]',
    transform: href => `/messages/scout-send?userId=${href.split("/").pop()}`,
    note: "撮影のみ（スカウトは送信しません）" },
  { id: "CLI-016", name: "スカウトメッセージテンプレート一覧", role: "client", path: "/messages/templates" },
  { id: "CLI-017", name: "スカウトメッセージテンプレート詳細", role: "client",
    from: "/messages/templates", pick: 'a[href^="/messages/templates/"]:not([href$="new"])' },
  { id: "CLI-018", name: "スカウトメッセージテンプレート編集", role: "client",
    from: "/messages/templates", pick: 'a[href^="/messages/templates/"]:not([href$="new"])', strip: /\/edit$/, suffix: "/edit" },
  { id: "CLI-019", name: "スカウトメッセージテンプレート新規作成", role: "client", path: "/messages/templates/new" },
  { id: "CLI-020", name: "発注者情報詳細", role: "client", path: "/mypage/client-profile" },
  { id: "CLI-021", name: "発注者情報編集", role: "client", path: "/mypage/client-profile/edit" },
  { id: "CLI-022", name: "担当者一覧", role: "client", path: "/mypage/members" },
  { id: "CLI-023", name: "担当者詳細", role: "client",
    from: "/mypage/members", pick: 'a[href^="/mypage/members/"]:not([href$="new"])' },
  { id: "CLI-024", name: "担当者編集", role: "client",
    from: "/mypage/members", pick: 'a[href^="/mypage/members/"]:not([href$="new"])', nth: 1, strip: /\/edit$/, suffix: "/edit",
    note: "先頭は Owner 本人（本人編集は /profile/edit へ移動する仕様）のため、2人目のメンバーで撮影" },
  { id: "CLI-025", name: "担当者新規作成", role: "client", path: "/mypage/members/new" },
  { id: "CLI-026", name: "有料プラン案内", role: "client", path: "/billing" },
  { id: "CLI-026B", name: "プラン比較表", role: "client", path: "/billing/plans" },
  { id: "CLI-027", name: "決済画面", skip: "決済会社（Stripe社）の画面のため撮影対象外" },
  { id: "CLI-028", name: "発注者評価", role: "client",
    from: "/users/contractors", pick: 'a[href^="/users/contractors/"]',
    transform: href => `/users/${href.split("/").pop()}/reviews` },

  // ---- 共通系 ----
  { id: "COM-001", name: "プロフィール詳細", role: "contractor", path: "/profile" },
  { id: "COM-002", name: "プロフィール編集", role: "contractor", path: "/profile/edit" },
  { id: "COM-003", name: "本人確認・CCUS登録申請", role: "contractor", path: "/profile/verification" },
  { id: "COM-004", name: "公的証明書・本人顔写真送付", role: "contractor", path: "/profile/verification/identity" },
  { id: "COM-005", name: "CCUS技術者ID・本人確認番号入力", role: "contractor", path: "/profile/verification/ccus" },
  { id: "COM-006", name: "退会手続き", role: "contractor", path: "/profile/withdrawal",
    note: "撮影のみ（退会は実行しません）" },
  { id: "COM-006B", name: "退会完了ページ", role: "none", path: "/withdrawal-complete" },
  { id: "COM-007", name: "よくある質問", role: "none", path: "/faq" },
  { id: "COM-008", name: "お問い合わせ", role: "none", path: "/contact" },
  { id: "COM-009", name: "利用規約", role: "none", path: "/terms" },
  { id: "COM-010", name: "プライバシーポリシー", role: "none", path: "/privacy" },
  { id: "COM-011", name: "特定商取引法に基づく表記", role: "none", path: "/legal" },
  { id: "COM-012", name: "トラブル報告", role: "contractor", path: "/trouble-report" },
  { id: "COM-013", name: "求人へのお問い合わせ（フォーム）", role: "contractor",
    from: "/clients", pick: 'a[href^="/clients/"]', suffix: "/inquiry",
    note: "撮影のみ（問い合わせは送信しません）" },
  { id: "COM-014", name: "求人へのお問い合わせ（受信箱一覧）", role: "client", path: "/mypage/job-inquiries" },
  { id: "COM-015", name: "求人へのお問い合わせ（受信箱詳細）", role: "client",
    from: "/mypage/job-inquiries", pick: 'a[href^="/mypage/job-inquiries/"]',
    note: "受信データが無い場合は撮影できません" },

  // ---- 管理者系（admin でログイン）----
  { id: "ADM-001", name: "管理者ログイン", role: "none", path: "/admin/login" },
  { id: "ADM-002", name: "管理者トップページ", role: "admin", path: "/admin/dashboard" },
  { id: "ADM-003", name: "発注者アカウント一覧", role: "admin", path: "/admin/clients" },
  { id: "ADM-004", name: "発注者アカウント詳細", role: "admin",
    from: "/admin/clients", pick: 'a[href^="/admin/clients/"]:not([href$="new"])' },
  { id: "ADM-005", name: "発注者アカウント編集", role: "admin",
    from: "/admin/clients", pick: 'a[href^="/admin/clients/"]:not([href$="new"])', strip: /\/edit$/, suffix: "/edit" },
  { id: "ADM-006", name: "発注者 管理責任者 新規作成", role: "admin", path: "/admin/clients/new" },
  { id: "ADM-007", name: "発注者 管理責任者 新規作成確認", skip: "ADM-006 と同じページ内の確認ステップのため、独立の撮影なし" },
  { id: "ADM-008", name: "ユーザーアカウント一覧", role: "admin", path: "/admin/users" },
  { id: "ADM-009", name: "ユーザーアカウント詳細", role: "admin",
    from: "/admin/users", pick: 'a[href^="/admin/users/"]' },
  { id: "ADM-010", name: "ユーザー動画投稿（受注者PR）", role: "admin",
    from: "/admin/users", pick: 'a[href^="/admin/users/"]', suffix: "/video",
    note: "動画オプション未加入のユーザーではリダイレクトされることあり" },
  { id: "ADM-010B", name: "ユーザー動画投稿（職場紹介）", role: "admin",
    from: "/admin/clients", pick: 'a[href^="/admin/clients/"]:not([href$="new"])',
    transform: href => `/admin/users/${href.split("/").pop()}/workplace-video`,
    note: "職場紹介動画オプション未加入ではリダイレクトされることあり" },
  { id: "ADM-011", name: "本人確認承認申請一覧", role: "admin", path: "/admin/verifications" },
  { id: "ADM-012", name: "本人確認承認可否", role: "admin",
    from: "/admin/verifications", pick: 'a[href^="/admin/verifications/"]',
    note: "承認待ちの申請が無い場合は撮影できません（B5 実施後に再実行）" },
  { id: "ADM-013", name: "応募履歴一覧", role: "admin", path: "/admin/applications" },
  { id: "ADM-014", name: "応募履歴詳細", role: "admin",
    from: "/admin/applications", pick: 'a[href^="/admin/applications/"]' },
  { id: "ADM-015", name: "管理者パスワード変更", role: "admin", path: "/admin/password" },
  { id: "ADM-016", name: "お問い合わせ一覧", role: "admin", path: "/admin/contacts" },
  { id: "ADM-017", name: "お問い合わせ詳細", role: "admin",
    from: "/admin/contacts", pick: 'a[href^="/admin/contacts/"]',
    note: "データが無い場合は撮影できません" },
  { id: "ADM-018", name: "トラブル報告一覧", role: "admin", path: "/admin/trouble-reports" },
  { id: "ADM-019", name: "トラブル報告詳細", role: "admin",
    from: "/admin/trouble-reports", pick: 'a[href^="/admin/trouble-reports/"]',
    note: "データが無い場合は撮影できません" },
  { id: "ADM-020", name: "求人問い合わせ一覧", role: "admin", path: "/admin/job-inquiries" },
  { id: "ADM-021", name: "求人問い合わせ詳細", role: "admin",
    from: "/admin/job-inquiries", pick: 'a[href^="/admin/job-inquiries/"]',
    note: "データが無い場合は撮影できません" },
  { id: "ADM-022", name: "募集現場詳細（運営閲覧）", role: "admin",
    via: { from: "/admin/applications", pick: 'a[href^="/admin/applications/"]' },
    pick: 'a[href^="/admin/jobs/"]', note: "応募履歴詳細内の案件リンクから解決（2段階）" },
  { id: "ADM-023", name: "代理メッセージ一覧", role: "admin", path: "/admin/messages" },
  { id: "ADM-024", name: "メッセージ詳細（代理メッセージ閲覧）", role: "admin",
    from: "/admin/messages", pick: 'a[href^="/admin/messages/"]',
    note: "代理メッセージが無い場合は撮影できません" },
];

// ---------------------------------------------------------------
async function login(context, role) {
  const page = await context.newPage();
  const isAdmin = role === "admin";
  const loginUrl = isAdmin ? `${BASE}/admin/login` : `${BASE}/login`;
  const emailSel = isAdmin ? 'input[type="email"]' : "#email";
  const passSel = isAdmin ? 'input[type="password"]' : "#password";
  const donePattern = isAdmin ? /\/admin\/dashboard/ : /\/mypage/;
  const email = isAdmin ? USERS.admin : USERS[role];

  // 注意: React の hydration 完了前に submit を押すと onSubmit が付く前の
  // 素の GET 送信になり（URL に ?email=... が付く）、ログインが発火しない。
  // networkidle まで待ってから操作し、それでも負けた場合はリトライする。
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(loginUrl, { waitUntil: "networkidle" });
    await page.locator(emailSel).fill(email);
    await page.locator(passSel).fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForURL(donePattern, { timeout: 30000 });
      await page.close();
      return;
    } catch (e) {
      if (attempt === 3) {
        await page.close().catch(() => {});
        throw e;
      }
      console.log(`  (login retry ${attempt}: ${role}, url=${page.url().split("?")[0]})`);
    }
  }
}

async function resolveUrl(page, def) {
  if (def.path) return BASE + def.path;
  let fromUrl = BASE + def.from;
  // via: 一覧 → 詳細 → その中のリンク、のように 2 段階で解決する場合
  if (def.via) {
    await page.goto(BASE + def.via.from, { waitUntil: "networkidle" });
    const viaLoc = page.locator(def.via.pick).first();
    if ((await viaLoc.count()) === 0) return null;
    const viaHref = await viaLoc.getAttribute("href");
    if (!viaHref) return null;
    fromUrl = BASE + viaHref;
  }
  await page.goto(fromUrl, { waitUntil: "networkidle" });
  const all = page.locator(def.pick);
  const loc = all.nth(def.nth || 0);
  if ((await all.count()) <= (def.nth || 0)) return null;
  let href = await loc.getAttribute("href");
  if (!href) return null;
  if (def.transform) return BASE + def.transform(href);
  if (def.strip) href = href.replace(def.strip, "");
  return BASE + href + (def.suffix || "");
}

async function main() {
  const browser = await chromium.launch();
  const contexts = {}; // role -> {pc, sp}
  async function ctxFor(role) {
    if (contexts[role]) return contexts[role];
    const pc = await browser.newContext({ viewport: PC, locale: "ja-JP" });
    const sp = await browser.newContext({ viewport: SP, locale: "ja-JP", isMobile: true, hasTouch: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
    if (role !== "none") {
      try {
        await login(pc, role);
        await login(sp, role);
      } catch (e) {
        // 失敗した context を放置すると後続の全撮影が重くなるため必ず閉じる
        await pc.close().catch(() => {});
        await sp.close().catch(() => {});
        throw e;
      }
    }
    contexts[role] = { pc, sp };
    return contexts[role];
  }

  // CAPTURE_ONLY での部分再撮影時は、前回の manifest.json を引き継いで
  // 対象外の画面のエントリを保持する（上書き消失防止）
  const manifestPath = path.join(OUT, "manifest.json");
  const prev = new Map();
  if (ONLY.length && fs.existsSync(manifestPath)) {
    for (const m of JSON.parse(fs.readFileSync(manifestPath, "utf8"))) prev.set(m.id, m);
  }

  const manifest = [];
  let idx = 0;
  for (const def of SCREENS) {
    idx++;
    const no = String(idx).padStart(3, "0");
    if (ONLY.length && !ONLY.includes(def.id)) {
      const kept = prev.get(def.id);
      if (kept) manifest.push({ ...kept, no });
      continue;
    }
    if (def.skip) {
      manifest.push({ no, id: def.id, name: def.name, status: "skip", note: def.skip });
      console.log(`- ${def.id} skip: ${def.skip}`);
      continue;
    }
    try {
      const { pc, sp } = await ctxFor(def.role);
      const pagePc = await pc.newPage();
      const url = await resolveUrl(pagePc, def);
      if (!url) {
        manifest.push({ no, id: def.id, name: def.name, status: "no-data", note: def.note || "一覧にデータが見つからず解決できませんでした" });
        console.log(`! ${def.id} no-data`);
        await pagePc.close();
        continue;
      }
      await pagePc.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await pagePc.waitForTimeout(800);
      const finalUrl = pagePc.url();
      await pagePc.screenshot({ path: path.join(PNG, `${no}_${def.id}_pc.png`), fullPage: true });
      await pagePc.close();

      const pageSp = await sp.newPage();
      await pageSp.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await pageSp.waitForTimeout(800);
      await pageSp.screenshot({ path: path.join(PNG, `${no}_${def.id}_sp.png`), fullPage: true });
      await pageSp.close();

      const redirected = finalUrl.replace(BASE, "").split("?")[0] !== url.replace(BASE, "").split("?")[0];
      manifest.push({ no, id: def.id, name: def.name, status: "ok", url: url.replace(BASE, ""),
        finalUrl: finalUrl.replace(BASE, ""), redirected, note: def.note || "" });
      console.log(`o ${def.id} ${url.replace(BASE, "")}${redirected ? "  →(リダイレクト) " + finalUrl.replace(BASE, "") : ""}`);
    } catch (e) {
      manifest.push({ no, id: def.id, name: def.name, status: "error", note: `${def.note || ""} / ${e.message.split("\n")[0]}` });
      console.log(`x ${def.id} error: ${e.message.split("\n")[0]}`);
    }
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1), "utf8");
  await browser.close();
  const ok = manifest.filter(m => m.status === "ok").length;
  console.log(`\n完了: ${ok} 画面撮影 / ${manifest.length} 件中（詳細: output/manifest.json）`);
}

main().catch(e => { console.error(e); process.exit(1); });
