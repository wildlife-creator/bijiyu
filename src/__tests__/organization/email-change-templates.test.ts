import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * §5.5.A / §5.5.B セルフメール変更確認テンプレ (Supabase Auth カスタム HTML)。
 * Go template の rendering 自体は Supabase 側でしか確認できないため、
 * ここでは「Go template 変数の差込位置」「M-09 共通レイアウト」「§5.5.B 固有の
 * パスワード継続案内が §5.5.A には無い」等の構造リグレッション防止に絞る。
 * 実際の差し込み結果は Inbucket 手動テストでカバー (spec §5.5「実装着手前の検証手順」)。
 */

const NEW_HTML = readFileSync(
  resolve(process.cwd(), "supabase/templates/email-change-new.html"),
  "utf8",
);
const CURRENT_HTML = readFileSync(
  resolve(process.cwd(), "supabase/templates/email-change-current.html"),
  "utf8",
);

describe("supabase/templates/email-change-new.html (§5.5.A)", () => {
  it("M-09 共通レイアウト (ロゴ + 紫太線 + 自動送信フッター)", () => {
    expect(NEW_HTML).toContain("logo-horizontal.png");
    expect(NEW_HTML).toContain("border-bottom:3px solid #920783");
    expect(NEW_HTML).toContain("このメールは ビジ友 から自動送信されています");
  });

  it("Go template 変数 {{ .Email }} {{ .NewEmail }} {{ .ConfirmationURL }} を含む (CTA + URL 直貼り)", () => {
    expect(NEW_HTML).toContain("{{ .Email }}");
    expect(NEW_HTML).toContain("{{ .NewEmail }}");
    // ConfirmationURL は CTA href + 直貼り = 2 回
    const occurrences = NEW_HTML.match(/{{ \.ConfirmationURL }}/g) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it("§5.5.A 固有: 「このアドレスを新しいログイン用アドレスとして登録」「現在のメールアドレス宛にも、同じ確認メール」", () => {
    expect(NEW_HTML).toContain(
      "このアドレスを新しいログイン用アドレスとして登録",
    );
    expect(NEW_HTML).toContain("※ 現在のメールアドレス宛にも、同じ確認メールが届いています");
    expect(NEW_HTML).toContain("変更を確定する");
    expect(NEW_HTML).toContain("24 時間有効");
  });

  it("§5.5.A 固有: パスワード継続案内は **含めない** (5.5.B との差分)", () => {
    expect(NEW_HTML).not.toContain("パスワードはこれまでのもの");
  });

  it("入れないもの: アプリ内 UI deep link / お問い合わせ CTA", () => {
    expect(NEW_HTML).not.toContain("マイページ");
    expect(NEW_HTML).not.toContain("/contact");
  });
});

describe("supabase/templates/email-change-current.html (§5.5.B)", () => {
  it("M-09 共通レイアウト (ロゴ + 紫太線 + 自動送信フッター)", () => {
    expect(CURRENT_HTML).toContain("logo-horizontal.png");
    expect(CURRENT_HTML).toContain("border-bottom:3px solid #920783");
    expect(CURRENT_HTML).toContain("このメールは ビジ友 から自動送信されています");
  });

  it("Go template 変数 {{ .Email }} {{ .NewEmail }} {{ .ConfirmationURL }} を含む (CTA + URL 直貼り)", () => {
    expect(CURRENT_HTML).toContain("{{ .Email }}");
    expect(CURRENT_HTML).toContain("{{ .NewEmail }}");
    const occurrences = CURRENT_HTML.match(/{{ \.ConfirmationURL }}/g) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it("§5.5.B 固有: 「変更を有効にするため、ご本人確認をお願いします」「新しいメールアドレス宛にも、同じ確認メール」", () => {
    expect(CURRENT_HTML).toContain("変更を有効にするため、ご本人確認をお願いします");
    expect(CURRENT_HTML).toContain("※ 新しいメールアドレス宛にも、同じ確認メールが届いています");
    expect(CURRENT_HTML).toContain("変更を確定する");
    expect(CURRENT_HTML).toContain("24 時間有効");
  });

  it("§5.5.B 固有: パスワード継続案内を **含める** (5.5.A との差分、現アカウント所有者の不安解消)", () => {
    expect(CURRENT_HTML).toContain(
      "パスワードはこれまでのものをそのままご利用いただけます",
    );
  });

  it("入れないもの: アプリ内 UI deep link / お問い合わせ CTA", () => {
    expect(CURRENT_HTML).not.toContain("マイページ");
    expect(CURRENT_HTML).not.toContain("/contact");
  });
});
