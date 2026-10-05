import { describe, expect, it } from "vitest";

import {
  canEditOrderDetails,
  diffOrderDetails,
  formatChangedOrderDetailFields,
  toApplicationDocumentPath,
  type OrderDetailsSnapshot,
} from "@/lib/order-details";
import { orderDetailsUpdatedEmail } from "@/lib/email/templates/order-details-updated";
import { orderDetailsUpdatedControlEmail } from "@/lib/email/templates/order-details-updated-control";

const NO_REVIEWS = { hasUserReview: false, hasClientReview: false };

describe("canEditOrderDetails", () => {
  it("発注確定で、どちらも完了報告を出していなければ編集できる", () => {
    expect(canEditOrderDetails({ status: "accepted" }, NO_REVIEWS)).toBe(true);
  });

  it.each(["applied", "completed", "lost", "cancelled", "rejected"])(
    "status = %s は編集できない",
    (status) => {
      expect(canEditOrderDetails({ status }, NO_REVIEWS)).toBe(false);
    },
  );

  it("発注者が完了報告を出したら編集できない", () => {
    expect(
      canEditOrderDetails(
        { status: "accepted" },
        { hasUserReview: true, hasClientReview: false },
      ),
    ).toBe(false);
  });

  it("受注者が完了報告を出したら編集できない", () => {
    expect(
      canEditOrderDetails(
        { status: "accepted" },
        { hasUserReview: false, hasClientReview: true },
      ),
    ).toBe(false);
  });
});

describe("diffOrderDetails", () => {
  const base: OrderDetailsSnapshot = {
    workLocation: "東京都渋谷区1-1-1",
    clientNotes: null,
    firstWorkDate: "2026-11-01",
    documents: ["u/a/1.jpg", "u/a/2.pdf"],
  };

  it("同じ内容なら空配列", () => {
    expect(diffOrderDetails(base, { ...base })).toEqual([]);
  });

  it("その他の null と空文字は同じ扱い", () => {
    expect(diffOrderDetails(base, { ...base, clientNotes: "" })).toEqual([]);
  });

  it("変わった項目を 初回稼働日 → 勤務地 → 書類 → その他 の順で返す", () => {
    expect(
      diffOrderDetails(base, {
        workLocation: "別の場所",
        clientNotes: "追記",
        firstWorkDate: "2026-11-02",
        documents: ["u/a/1.jpg"],
      }),
    ).toEqual(["firstWorkDate", "workLocation", "documents", "clientNotes"]);
  });

  it("書類は件数が同じでも中身が違えば変更", () => {
    expect(
      diffOrderDetails(base, { ...base, documents: ["u/a/1.jpg", "u/a/3.pdf"] }),
    ).toEqual(["documents"]);
  });

  it("項目名を「、」でつなぐ", () => {
    expect(formatChangedOrderDetailFields(["firstWorkDate", "documents"])).toBe(
      "初回稼働日、業務に関する書類",
    );
  });
});

describe("toApplicationDocumentPath", () => {
  it("パスはそのまま返す", () => {
    expect(toApplicationDocumentPath("u/a/1.jpg")).toBe("u/a/1.jpg");
  });

  it("旧形式の公開 URL からパスを取り出す", () => {
    expect(
      toApplicationDocumentPath(
        "https://x.supabase.co/storage/v1/object/public/application-documents/u/a/1.jpg",
      ),
    ).toBe("u/a/1.jpg");
  });

  it("別バケットの URL は null", () => {
    expect(
      toApplicationDocumentPath(
        "https://x.supabase.co/storage/v1/object/public/job-attachments/u/1.jpg",
      ),
    ).toBeNull();
  });
});

describe("発注内容の変更メール", () => {
  it("受注者宛: 初回稼働日が変わっていなければ日付の行を出さない", () => {
    const { subject, html } = orderDetailsUpdatedEmail({
      applicantName: "高橋美咲",
      jobTitle: "外壁塗装の応援",
      clientName: "田中工務店",
      changedFields: "勤務地",
    });
    expect(subject).toBe("【ビジ友】「外壁塗装の応援」の発注内容が変更されました");
    expect(html).toContain("高橋美咲 様");
    expect(html).toContain("【変更された項目】 勤務地");
    expect(html).not.toContain("【初回稼働日】");
    expect(html).toContain("応募履歴の「勤務についての詳細」でご確認ください。");
  });

  it("受注者宛: 変更前の日付が無ければ変更後だけ出す", () => {
    const { html } = orderDetailsUpdatedEmail({
      applicantName: "高橋美咲",
      jobTitle: "外壁塗装の応援",
      clientName: "田中工務店",
      changedFields: "初回稼働日",
      firstWorkDateChange: { after: "2026/11/05" },
    });
    expect(html).toContain("【初回稼働日】 2026/11/05<");
  });

  it("発注者控え: 変更日時と変更前後の日付を載せる", () => {
    const { subject, html } = orderDetailsUpdatedControlEmail({
      recipientName: "田中一郎",
      jobTitle: "外壁塗装の応援",
      contractorName: "高橋美咲",
      changedFields: "初回稼働日、勤務地",
      firstWorkDateChange: { before: "2026/11/01", after: "2026/11/05" },
      updatedAt: "2026/10/05 14:30",
    });
    expect(subject).toBe("【ビジ友】「外壁塗装の応援」の発注内容を変更しました");
    expect(html).toContain("田中一郎 様");
    expect(html).toContain("【変更した項目】 初回稼働日、勤務地");
    expect(html).toContain("【初回稼働日】 2026/11/05（変更前：2026/11/01）");
    expect(html).toContain("【変更日時】 2026/10/05 14:30");
  });

  it("案件名に HTML が入っていてもエスケープされる", () => {
    const { html } = orderDetailsUpdatedEmail({
      applicantName: "高橋美咲",
      jobTitle: "<b>x</b>",
      clientName: "田中工務店",
      changedFields: "勤務地",
    });
    expect(html).not.toContain("【案件名】 <b>x</b>");
  });
});
