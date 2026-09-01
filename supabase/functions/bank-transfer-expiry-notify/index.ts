/**
 * Edge Function: bank-transfer-expiry-notify
 *
 * Called daily by pg_cron (03:30 JST = 18:30 UTC) via pg_net.
 *
 * 銀行振込（payment_method='bank_transfer'）で契約中のプラン / 補償オプションのうち、
 * 有効期限（subscriptions.current_period_end / option_subscriptions.end_date）が
 * **30 日後** または **当日** のものを集め、運営宛にまとめて 1 通の通知メールを送る。
 * 期限が来ても自動停止はしない（D3: 管理画面での手動更新）。
 *
 * 送信は Resend REST API を直接叩く（Next.js の sendEmail は使えない）。
 * 必要な環境変数（Supabase Edge Function secrets）:
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（自動注入）
 *   RESEND_API_KEY / EMAIL_FROM / OPS_NOTIFICATION_EMAIL / APP_URL（deep link 用）
 * RESEND_API_KEY が無いローカルでは送信せずログ出力のみ。
 *
 * Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPIRING_SOON_DAYS = 30;

const PLAN_LABELS: Record<string, string> = {
  individual: "ライトプラン",
  small: "スタンダードプラン",
  corporate: "プレミアムプラン",
  corporate_premium: "ハイエンドプラン",
};

const OPTION_LABELS: Record<string, string> = {
  compensation_5000: "補償（5,000円/月、最大200万円）",
  compensation_9800: "補償（9,800円/月、最大500万円）",
};

const CYCLE_LABELS: Record<string, string> = {
  monthly: "月払い",
  yearly: "年払い",
};

interface ExpiringItem {
  userId: string;
  userName: string;
  companyName: string | null;
  email: string;
  targetLabel: string;
  periodEnd: string; // YYYY-MM-DD (JST)
  kind: "today" | "soon";
}

/** timestamptz → JST の暦日（YYYY-MM-DD） */
function toJstDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function toSlash(dateStr: string): string {
  return dateStr.replaceAll("-", "/");
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function classify(periodEndIso: string | null, today: string): { kind: "today" | "soon"; periodEnd: string } | null {
  if (!periodEndIso) return null;
  const periodEnd = toJstDate(periodEndIso);
  const remaining = diffDays(today, periodEnd);
  if (remaining === 0) return { kind: "today", periodEnd };
  if (remaining === EXPIRING_SOON_DAYS) return { kind: "soon", periodEnd };
  return null;
}

function renderEmail(items: ExpiringItem[], appUrl: string): { subject: string; html: string } {
  const todayItems = items.filter((i) => i.kind === "today");
  const soonItems = items.filter((i) => i.kind === "soon");

  const renderList = (list: ExpiringItem[]) =>
    list
      .map((i) => {
        const who = i.companyName ? `${escapeHtml(i.companyName)}（${escapeHtml(i.userName)}）` : escapeHtml(i.userName);
        return `<li style="margin-bottom:8px;">${who}<br/>${escapeHtml(i.email)}<br/>${escapeHtml(i.targetLabel)} ／ 有効期限 ${toSlash(i.periodEnd)}<br/><a href="${appUrl}/admin/clients/${i.userId}">${appUrl}/admin/clients/${i.userId}</a></li>`;
      })
      .join("");

  const sections: string[] = [];
  if (todayItems.length > 0) {
    sections.push(`<h3 style="margin:16px 0 8px;">本日が有効期限（${todayItems.length}件）</h3><ul>${renderList(todayItems)}</ul>`);
  }
  if (soonItems.length > 0) {
    sections.push(`<h3 style="margin:16px 0 8px;">有効期限まで${EXPIRING_SOON_DAYS}日（${soonItems.length}件）</h3><ul>${renderList(soonItems)}</ul>`);
  }

  const html = `<!doctype html><html lang="ja"><body style="font-family:sans-serif;color:#333;line-height:1.7;">
<h2 style="color:#920783;">銀行振込契約の有効期限のお知らせ</h2>
<p>銀行振込でご契約中のプラン・オプションのうち、有効期限が近いものをお知らせします。</p>
<p>期限が来ても自動では停止しません。継続の場合は請求書を送付し、入金確認後に管理画面の「期限延長」で更新してください。停止する場合は管理画面から解約してください。</p>
${sections.join("")}
<p style="color:#888;font-size:12px;">ログインした状態でリンクをクリックしてください。</p>
</body></html>`;

  return {
    subject: `【ビジ友 運営】銀行振込契約の有効期限が近づいています（本日 ${todayItems.length}件 / 30日後 ${soonItems.length}件）`,
    html,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ---- Auth check ----
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    console.error("[bank-transfer-expiry-notify] unauthorized request");
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const today = toJstDate(new Date().toISOString());

  // ---- 対象の収集 ----
  const [{ data: subs, error: subErr }, { data: opts, error: optErr }] = await Promise.all([
    admin
      .from("subscriptions")
      .select("user_id, plan_type, billing_cycle, current_period_end")
      .eq("payment_method", "bank_transfer")
      .eq("status", "active")
      .not("current_period_end", "is", null),
    admin
      .from("option_subscriptions")
      .select("user_id, option_type, end_date")
      .eq("payment_method", "bank_transfer")
      .eq("status", "active")
      .in("option_type", ["compensation_5000", "compensation_9800"])
      .not("end_date", "is", null),
  ]);

  if (subErr || optErr) {
    console.error("[bank-transfer-expiry-notify] query error", subErr ?? optErr);
    return Response.json(
      { total: 0, sent: false, errors: [{ message: (subErr ?? optErr)?.message }] },
      { status: 500, headers: corsHeaders },
    );
  }

  type Candidate = { userId: string; targetLabel: string; kind: "today" | "soon"; periodEnd: string };
  const candidates: Candidate[] = [];
  for (const s of subs ?? []) {
    const c = classify(s.current_period_end as string | null, today);
    if (!c) continue;
    const label = `${PLAN_LABELS[s.plan_type as string] ?? s.plan_type}（${CYCLE_LABELS[s.billing_cycle as string] ?? s.billing_cycle}）`;
    candidates.push({ userId: s.user_id as string, targetLabel: label, ...c });
  }
  for (const o of opts ?? []) {
    const c = classify(o.end_date as string | null, today);
    if (!c) continue;
    const label = OPTION_LABELS[o.option_type as string] ?? (o.option_type as string);
    candidates.push({ userId: o.user_id as string, targetLabel: label, ...c });
  }

  if (candidates.length === 0) {
    console.log("[bank-transfer-expiry-notify] nothing to notify");
    return Response.json({ total: 0, sent: false, errors: [] }, { headers: corsHeaders });
  }

  // ---- 申込者情報 ----
  const userIds = Array.from(new Set(candidates.map((c) => c.userId)));
  const [{ data: users }, { data: profiles }] = await Promise.all([
    admin.from("users").select("id, email, last_name, first_name").in("id", userIds),
    admin.from("client_profiles").select("user_id, display_name").in("user_id", userIds),
  ]);
  const userById = new Map((users ?? []).map((u) => [u.id as string, u]));
  const companyByUser = new Map((profiles ?? []).map((p) => [p.user_id as string, p.display_name as string | null]));

  const items: ExpiringItem[] = candidates.map((c) => {
    const u = userById.get(c.userId);
    return {
      userId: c.userId,
      userName: `${(u?.last_name as string) ?? ""}${(u?.first_name as string) ?? ""}`.trim() || "（氏名未設定）",
      companyName: companyByUser.get(c.userId) ?? null,
      email: (u?.email as string) ?? "",
      targetLabel: c.targetLabel,
      periodEnd: c.periodEnd,
      kind: c.kind,
    };
  });

  const appUrl = (Deno.env.get("APP_URL") ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const { subject, html } = renderEmail(items, appUrl);

  // ---- 送信 ----
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const opsEmail = Deno.env.get("OPS_NOTIFICATION_EMAIL");
  const from = Deno.env.get("EMAIL_FROM") ?? "noreply@bijiyuu.net";

  if (!opsEmail) {
    console.error("[bank-transfer-expiry-notify] OPS_NOTIFICATION_EMAIL is not set");
    return Response.json(
      { total: items.length, sent: false, errors: [{ message: "OPS_NOTIFICATION_EMAIL missing" }] },
      { status: 500, headers: corsHeaders },
    );
  }

  if (!resendKey) {
    console.log("[bank-transfer-expiry-notify] RESEND_API_KEY missing — dry run", { to: opsEmail, subject, items });
    return Response.json({ total: items.length, sent: false, dryRun: true, errors: [] }, { headers: corsHeaders });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [opsEmail], subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[bank-transfer-expiry-notify] resend failed", res.status, text);
    return Response.json(
      { total: items.length, sent: false, errors: [{ message: `resend ${res.status}: ${text}` }] },
      { status: 500, headers: corsHeaders },
    );
  }

  console.log(`[bank-transfer-expiry-notify] sent: total=${items.length}`);
  return Response.json({ total: items.length, sent: true, errors: [] }, { headers: corsHeaders });
});
