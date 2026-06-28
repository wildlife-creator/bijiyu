import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * §5.1 招待メール: supabase/templates/invite.html の構造リグレッション防止。
 *
 * Go template 自体は Supabase 側でしか render できないため、
 * ここでは「3 ケース分岐が正しく書かれている」「各ケース固有の文言が含まれる」
 * 「共通レイアウト（ロゴ・footer 自動送信文）が壊れていない」ことだけ
 * 文字列レベルで検証する。実際の差し込み結果は Inbucket 手動テストでカバー。
 */

const INVITE_HTML = readFileSync(
  resolve(process.cwd(), "supabase/templates/invite.html"),
  "utf8",
);

describe("supabase/templates/invite.html", () => {
  it("M-09 共通レイアウト (ロゴ + 紫太線 + 自動送信フッター) を含む", () => {
    expect(INVITE_HTML).toContain("logo-horizontal.png");
    expect(INVITE_HTML).toContain("border-bottom:3px solid #920783");
    expect(INVITE_HTML).toContain("このメールは ビジ友 から自動送信されています");
  });

  it("3 ケース分岐の Go template (is_proxy_account / invited_company_name / else) を含む", () => {
    expect(INVITE_HTML).toContain("{{ if .Data.is_proxy_account }}");
    expect(INVITE_HTML).toContain("{{ else if .Data.invited_company_name }}");
    expect(INVITE_HTML).toContain("{{ else }}");
    expect(INVITE_HTML).toContain("{{ end }}");
  });

  it("ConfirmationURL は CTA ボタンと URL 直貼り両方に差し込まれる (M-08 準拠)", () => {
    const occurrences = INVITE_HTML.match(/{{ \.ConfirmationURL }}/g) ?? [];
    // 3 ケース × (ボタン href + 直貼り)= 6 回
    expect(occurrences.length).toBeGreaterThanOrEqual(6);
  });

  it("§5.1-Staff: 「『…』の担当者として」「招待元の管理責任者または管理者へ」", () => {
    expect(INVITE_HTML).toContain("」の担当者としてご招待が届いています");
    expect(INVITE_HTML).toContain("招待元の管理責任者または管理者へ");
  });

  it("§5.1-Proxy: 「ビジ友運営より、…の代理アカウントとして」「【設定操作者】」「『代理』マーク」", () => {
    expect(INVITE_HTML).toContain("ビジ友運営より、");
    expect(INVITE_HTML).toContain("代理アカウントとしてご招待をお送りします");
    expect(INVITE_HTML).toContain("【設定操作者】");
    expect(INVITE_HTML).toContain("【設定日時】");
    expect(INVITE_HTML).toContain("「代理」マーク");
    // Staff と分けて 招待元の管理責任者「のみ」を案内（admin は出さない）
    expect(INVITE_HTML).toContain("招待元の管理責任者へ再送をご依頼ください");
  });

  it("§5.1-Client: 「『…』の発注者アカウントへのご招待」「ビジ友運営までお問い合わせ」", () => {
    expect(INVITE_HTML).toContain("の発注者アカウントへのご招待をお送りします");
    expect(INVITE_HTML).toContain("ビジ友運営までお問い合わせください");
  });

  it("3 ケース共通の文言「ご招待を承諾する」「24 時間有効」「破棄してください」", () => {
    const acceptCount = (INVITE_HTML.match(/ご招待を承諾する/g) ?? []).length;
    const expiryCount = (INVITE_HTML.match(/24 時間有効/g) ?? []).length;
    const discardCount = (INVITE_HTML.match(/破棄してください/g) ?? []).length;
    expect(acceptCount).toBe(3);
    expect(expiryCount).toBe(3);
    expect(discardCount).toBe(3);
  });

  it("入れないもの: アプリ内 UI deep link / 機能紹介の繰り返し", () => {
    expect(INVITE_HTML).not.toContain("マイページ");
    expect(INVITE_HTML).not.toContain("お問い合わせフォーム");
  });
});
