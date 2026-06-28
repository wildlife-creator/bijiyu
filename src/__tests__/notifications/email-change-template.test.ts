import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * §5.5 Pattern X 統合 (commit 0030e76) 回帰防止 — 静的 assertion。
 *
 * 背景:
 *   Supabase CLI v2.75.0 / gotrue は `[auth.email.template.email_change_current]`
 *   セクションをサイレントに無視し、`double_confirm_changes = true` 下でも
 *   `[auth.email.template.email_change]` 1 テンプレを 旧 + 新 両方の宛先に使う。
 *   このため「新アドレス用」文言を持つテンプレが旧アドレスにも届く虚偽通知バグが発生。
 *
 * Fix:
 *   - config.toml から `[auth.email.template.email_change_current]` セクションを削除
 *   - `[auth.email.template.email_change]` を `supabase/templates/email-change-new.html` 単一指定
 *   - email-change-new.html を「旧・新どちらが読んでも矛盾しない中立文 + セキュリティ案内
 *     + パスワード継続案内」を 1 テンプレに統合する形に書き換え
 *
 * 詳細記録: `.kiro/specs/notifications/email-decisions-wip.md` §5.5
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

describe("§5.5 Pattern X 統合: email_change テンプレ構成", () => {
  it("supabase/config.toml に `[auth.email.template.email_change_current]` セクションが存在しない (旧構成への巻き戻し検知)", async () => {
    const configPath = path.join(REPO_ROOT, "supabase", "config.toml");
    const config = await readFile(configPath, "utf8");

    // セクション見出しの行頭一致で検査 (コメント文中の言及は除外、改行直後の `[…]` のみ)
    // ※ Pattern X 統合の経緯説明として **コメント中に文字列としては登場する** ため、
    //    必ず行頭一致でセクション宣言を判定する。
    const sectionRegex = /^\[auth\.email\.template\.email_change_current\]/m;
    expect(sectionRegex.test(config)).toBe(false);
  });

  it("supabase/config.toml の `[auth.email.template.email_change]` は email-change-new.html を指す", async () => {
    const configPath = path.join(REPO_ROOT, "supabase", "config.toml");
    const config = await readFile(configPath, "utf8");

    // セクション内 content_path 行を抽出 (改行で区切られた直近の content_path)
    const section = config.match(
      /^\[auth\.email\.template\.email_change\][\s\S]+?(?=^\[|\Z)/m,
    );
    expect(section).not.toBeNull();
    expect(section![0]).toMatch(
      /content_path\s*=\s*"\.\/supabase\/templates\/email-change-new\.html"/,
    );
  });

  it("supabase/templates に旧 email-change-current.html 系のファイルが存在しない (whitelist 検査)", async () => {
    const templatesDir = path.join(REPO_ROOT, "supabase", "templates");
    const files = await readdir(templatesDir);

    // 旧構成の名残 (email-change-current.html, email_change_current.html, etc.) を弾く
    const offenders = files.filter((f) => /email[-_]change[-_]current/i.test(f));
    expect(offenders).toEqual([]);
  });

  it("supabase/templates/email-change-new.html に中立文 keyword が含まれる (Pattern X 統合の本文骨格を壊しても気付ける)", async () => {
    const tmplPath = path.join(
      REPO_ROOT,
      "supabase",
      "templates",
      "email-change-new.html",
    );
    const html = await readFile(tmplPath, "utf8");

    // 中立文: 旧 + 新 両宛で矛盾しない言い回し
    expect(html).toContain("両方");
    expect(html).toContain("メールアドレス");
    // 旧 / 現在 / 新しい の参照ラベル (Go template による {{ .Email }} / {{ .NewEmail }} の併記)
    expect(html).toContain("現在のメールアドレス");
    expect(html).toContain("新しいメールアドレス");
    // パスワード継続案内 (Pattern X の重要情報吸収)
    expect(html).toContain("パスワード");
    // Go template 変数の両方が参照されている (両宛配信で identical body でも値が同じため成立)
    expect(html).toContain("{{ .Email }}");
    expect(html).toContain("{{ .NewEmail }}");
    expect(html).toContain("{{ .ConfirmationURL }}");
  });
});
