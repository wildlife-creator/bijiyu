import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { linkifyText } from "@/lib/utils/linkify";

interface AnchorProps {
  href: string;
  target: string;
  rel: string;
  className: string;
  children: ReactNode;
}

function anchors(nodes: ReactNode[]): ReactElement<AnchorProps>[] {
  return nodes.filter(
    (node): node is ReactElement<AnchorProps> =>
      isValidElement(node) && node.type === "a",
  );
}

/** 表示される文字列を連結する（リンクは中身のテキスト） */
function plainText(nodes: ReactNode[]): string {
  return nodes
    .map((node) =>
      isValidElement<AnchorProps>(node) ? String(node.props.children) : String(node),
    )
    .join("");
}

describe("linkifyText", () => {
  it("文中の https URL がリンク化される", () => {
    const text = "職人紹介です https://bijiyuu.net/users/abc をご覧ください";
    const nodes = linkifyText(text);

    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toBe("職人紹介です ");
    const [link] = anchors(nodes);
    expect(link.props.href).toBe("https://bijiyuu.net/users/abc");
    expect(link.props.children).toBe("https://bijiyuu.net/users/abc");
    expect(nodes[2]).toBe(" をご覧ください");
    expect(plainText(nodes)).toBe(text);
  });

  it("http もリンク化される", () => {
    const [link] = anchors(linkifyText("http://example.com/path?q=1"));
    expect(link.props.href).toBe("http://example.com/path?q=1");
  });

  it("リンクは新しいタブで開き、noopener noreferrer と折り返しクラスを持つ", () => {
    const [link] = anchors(linkifyText("https://example.com"));
    expect(link.props.target).toBe("_blank");
    expect(link.props.rel).toBe("noopener noreferrer");
    expect(link.props.className).toContain("break-all");
    expect(link.props.className).toContain("underline");
  });

  it("javascript:alert(1) はリンク化されない", () => {
    const text = "javascript:alert(1)";
    expect(linkifyText(text)).toEqual([text]);
  });

  it("http/https 以外のスキームはリンク化されない", () => {
    for (const text of ["ftp://example.com", "data:text/html,<b>x</b>", "mailto:a@example.com"]) {
      expect(anchors(linkifyText(text))).toHaveLength(0);
    }
  });

  it("「詳細はこちら https://example.com/a 。」で句点が URL に含まれない", () => {
    const nodes = linkifyText("詳細はこちら https://example.com/a 。");
    const [link] = anchors(nodes);
    expect(link.props.href).toBe("https://example.com/a");
    expect(nodes.at(-1)).toBe(" 。");
  });

  it("日本語の句読点・全角括弧が URL 直後に続いても含めない", () => {
    const cases: [string, string][] = [
      ["こちら https://example.com/a。", "https://example.com/a"],
      ["こちら https://example.com/a、あちら", "https://example.com/a"],
      ["（https://example.com/a）を参照", "https://example.com/a"],
      ["「https://example.com/a」", "https://example.com/a"],
      ["URLはhttps://example.com/aです", "https://example.com/a"],
    ];
    for (const [text, expected] of cases) {
      const nodes = linkifyText(text);
      expect(anchors(nodes).map((a) => a.props.href)).toEqual([expected]);
      expect(plainText(nodes)).toBe(text);
    }
  });

  it("ASCII の句読点・対応しない閉じ括弧は URL に含めない", () => {
    expect(anchors(linkifyText("See https://example.com/a.")).at(0)?.props.href).toBe(
      "https://example.com/a",
    );
    expect(anchors(linkifyText("(https://example.com/a)")).at(0)?.props.href).toBe(
      "https://example.com/a",
    );
    // URL 内で対応する括弧は残す
    expect(
      anchors(linkifyText("https://ja.wikipedia.org/wiki/Foo_(bar)")).at(0)?.props.href,
    ).toBe("https://ja.wikipedia.org/wiki/Foo_(bar)");
  });

  it("複数の URL と改行を含む本文でも、それぞれリンク化し本文は変わらない", () => {
    const text = "1件目 https://a.example.com\n2件目 http://b.example.com/x";
    const nodes = linkifyText(text);
    expect(anchors(nodes).map((a) => a.props.href)).toEqual([
      "https://a.example.com",
      "http://b.example.com/x",
    ]);
    expect(plainText(nodes)).toBe(text);
  });

  it("ホスト名のない URL や英字直後の http はリンク化しない", () => {
    expect(anchors(linkifyText("https:// だけ"))).toHaveLength(0);
    expect(anchors(linkifyText("xhttps://example.com"))).toHaveLength(0);
  });

  it("HTML タグを含む本文も文字列のまま返す（HTML として解釈しない）", () => {
    const text = '<img src=x onerror="alert(1)">';
    expect(linkifyText(text)).toEqual([text]);
  });

  it("URL を含まないテキストはそのまま 1 要素で返る", () => {
    expect(linkifyText("よろしくお願いします。")).toEqual(["よろしくお願いします。"]);
    expect(linkifyText("")).toEqual([""]);
  });
});
