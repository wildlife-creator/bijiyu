import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * §5.5 セルフメール変更確認テンプレ (Supabase Auth カスタム HTML)。
 *
 * 2026-06-28 runtime audit で **パターン X (単一テンプレ) 採用に確定**:
 * Supabase CLI v2.75.0 が `[auth.email.template.email_change_current]` 設定を
 * サイレントに無視し、`double_confirm_changes = true` 下でも `email_change` 1 テンプレを
 * 旧 + 新両方の宛先に使う動作のため、Pattern Y (2 テンプレ分離) は成立しない。
 * `.Email` / `.NewEmail` は両宛先で同一値のため Go template 分岐も使えない。
 *
 * このテストは「旧・新どちらが読んでも矛盾しない中立文 + §5.5.B 固有の重要要素
 * (パスワード継続案内 / セキュリティ案内) が統合されている」ことを保証する。
 *
 * 実際の差し込み結果は Inbucket / Mailpit 手動テストでカバー (spec §5.5 検証済記述)。
 */

const HTML = readFileSync(
  resolve(process.cwd(), "supabase/templates/email-change-new.html"),
  "utf8",
);

describe("supabase/templates/email-change-new.html (§5.5 統合 Pattern X)", () => {
  it("M-09 共通レイアウト (ロゴ + 紫太線 + 自動送信フッター)", () => {
    expect(HTML).toContain("logo-horizontal.png");
    expect(HTML).toContain("border-bottom:3px solid #920783");
    expect(HTML).toContain("このメールは ビジ友 から自動送信されています");
  });

  it("Go template 変数 {{ .Email }} {{ .NewEmail }} {{ .ConfirmationURL }} を含む (CTA + URL 直貼り)", () => {
    expect(HTML).toContain("{{ .Email }}");
    expect(HTML).toContain("{{ .NewEmail }}");
    // ConfirmationURL は CTA href + 直貼り = 2 回
    const occurrences = HTML.match(/{{ \.ConfirmationURL }}/g) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it("M-08 準拠 (CTA ピル型 + 平文 URL 再掲)", () => {
    expect(HTML).toContain("border-radius:47px");
    expect(HTML).toContain("変更を確定する");
    expect(HTML).toContain(
      "ボタンが押せない場合は、下記の URL をブラウザに貼り付けてください",
    );
  });

  it("中立文: 旧・新どちらの受信者が読んでも矛盾しない opening", () => {
    // Pattern Y 時代の「このアドレスを新しいログイン用アドレスとして」(新宛のみ妥当) は廃止
    expect(HTML).not.toContain("このアドレスを新しいログイン用アドレスとして");
    // 中立な「ご本人確認のため、下記のリンクから変更を確定してください」
    expect(HTML).toContain("ご本人確認のため、下記のリンクから変更を確定してください");
  });

  it("両方の宛先に送信されている旨を明示 (Pattern X 統合)", () => {
    expect(HTML).toContain(
      "このメールは現在のメールアドレスと新しいメールアドレスの両方にお送りしています",
    );
    expect(HTML).toContain(
      "変更の完了には、両方のメールのリンクをクリックする必要があります",
    );
  });

  it("§5.5.B 由来の重要要素を統合: パスワード継続案内", () => {
    expect(HTML).toContain(
      "パスワードはこれまでのものをそのままご利用いただけます",
    );
  });

  it("§5.5.B 由来の重要要素を統合: 乗っ取り対策セキュリティ案内", () => {
    expect(HTML).toContain(
      "ご本人による操作でない場合は、パスワードをすぐに再設定してください",
    );
  });

  it("24 時間有効案内 + 期限切れフォールバック", () => {
    expect(HTML).toContain("24 時間有効");
    expect(HTML).toContain(
      "リンクの有効期限が切れた場合は、お手数ですが再度メールアドレス変更をお申し込みください",
    );
  });

  it("入れないもの: アプリ内 UI deep link / お問い合わせ CTA", () => {
    expect(HTML).not.toContain("マイページ");
    expect(HTML).not.toContain("/contact");
  });
});
