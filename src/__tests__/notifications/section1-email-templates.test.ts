import { describe, expect, it } from "vitest";

import { applicationReceivedEmail } from "@/lib/email/templates/application-received";
import { applicationConfirmationEmail } from "@/lib/email/templates/application-confirmation";
import { applicationCancelledControlEmail } from "@/lib/email/templates/application-cancelled-control";
import { applicationCancelledEmail } from "@/lib/email/templates/application-cancelled";
import { scoutDeclinedControlEmail } from "@/lib/email/templates/scout-declined-control";
import { orderAcceptedControlEmail } from "@/lib/email/templates/order-accepted-control";
import { orderRejectedControlEmail } from "@/lib/email/templates/order-rejected-control";
import { scoutSentBroadcastEmail } from "@/lib/email/templates/scout-sent-broadcast";
import { completionReportToClientEmail } from "@/lib/email/templates/completion-report-to-client";
import { completionReportToContractorEmail } from "@/lib/email/templates/completion-report-to-contractor";

// ----------------------------------------------------------------------------
// §1.1.A / §1.4.A 発注者宛応募通知 (unified)
// ----------------------------------------------------------------------------

describe("applicationReceivedEmail — §1.1.A / §1.4.A", () => {
  const BASE_PROPS = {
    recipientName: "山田工務店",
    jobTitle: "△△工事",
    applicantName: "××建設",
    tradeType: "型枠大工",
    headcount: 3,
    appliedAt: "2026/06/18 14:30",
    messageExcerpt: "ぜひ協力させてください。当社では型枠工事を主に扱っております。",
  };

  it("§1.1.A 通常応募: 件名末尾に「（スカウト経由）」を付けない", () => {
    const out = applicationReceivedEmail(BASE_PROPS);
    expect(out.subject).toBe("【ビジ友】「△△工事」へのご応募がありました");
    expect(out.subject).not.toContain("（スカウト経由）");
  });

  it("§1.1.A: 本文に宛名・案件名・応募者・職種・応募人数・応募日時・メッセージ抜粋・closing を含む", () => {
    const out = applicationReceivedEmail(BASE_PROPS);
    expect(out.html).toContain("山田工務店 様");
    expect(out.html).toContain("下記の案件にご応募がありました。");
    expect(out.html).toContain("【案件名】 △△工事");
    expect(out.html).toContain("【応募者】 ××建設");
    expect(out.html).toContain("【職種】 型枠大工");
    expect(out.html).toContain("【応募人数】 3人");
    expect(out.html).toContain("【応募日時】 2026/06/18 14:30");
    expect(out.html).toContain("【メッセージ】");
    expect(out.html).toContain("ぜひ協力させてください");
    expect(out.html).toContain("発注可否をご検討ください");
  });

  it("§1.4.A スカウト経由: 件名末尾「（スカウト経由）」+ opening 変化 + 【スカウト送信日】行", () => {
    const out = applicationReceivedEmail({
      ...BASE_PROPS,
      scoutSentDate: "2026/06/15",
    });
    expect(out.subject).toBe("【ビジ友】「△△工事」へのご応募がありました（スカウト経由）");
    expect(out.html).toContain("あなたがスカウトを送信した受注者から、ご応募がありました。");
    expect(out.html).toContain("【スカウト送信日】 2026/06/15");
    expect(out.html).not.toContain("下記の案件にご応募がありました。");
  });

  it("§1.1.A: 応募人数 NULL なら行ごと省略 / メッセージ空なら【メッセージ】行省略", () => {
    const out = applicationReceivedEmail({
      ...BASE_PROPS,
      headcount: null,
      messageExcerpt: "",
    });
    expect(out.html).not.toContain("【応募人数】");
    expect(out.html).not.toContain("【メッセージ】");
  });

  it("§1.1.A: 入れない要素 (UI 名指し / CTA リンクなし)", () => {
    const out = applicationReceivedEmail(BASE_PROPS);
    expect(out.html).not.toContain("応募一覧");
    expect(out.html).not.toContain("応募者管理");
    expect(out.html).not.toContain("ログインして");
    expect(out.html).not.toContain("発注処理を行う");
  });
});

// ----------------------------------------------------------------------------
// §1.1.B / §1.4.B 受注者宛応募控え
// ----------------------------------------------------------------------------

describe("applicationConfirmationEmail — §1.1.B / §1.4.B", () => {
  const BASE_PROPS = {
    applicantName: "田中花子",
    jobTitle: "△△工事",
    clientName: "株式会社□□建設",
    tradeType: "型枠大工",
    area: "東京都（港区）",
    headcount: 3,
    appliedAt: "2026/06/22 14:30",
  };

  it("件名は「ご応募を受け付けました」", () => {
    const out = applicationConfirmationEmail(BASE_PROPS);
    expect(out.subject).toBe("【ビジ友】「△△工事」へのご応募を受け付けました");
  });

  it("本文に宛名・発注者・職種・エリア・応募人数・応募日時・closing を含む", () => {
    const out = applicationConfirmationEmail(BASE_PROPS);
    expect(out.html).toContain("田中花子 様");
    expect(out.html).toContain("下記の案件へのご応募を受け付けました。");
    expect(out.html).toContain("【案件名】 △△工事");
    expect(out.html).toContain("【発注者】 株式会社□□建設");
    expect(out.html).toContain("【エリア】 東京都");
    expect(out.html).toContain("【応募人数】 3人");
    expect(out.html).toContain("【応募日時】 2026/06/22 14:30");
    expect(out.html).toContain("発注者から返信があり次第、改めてお知らせします。");
  });

  it("入れない要素: CTA・募集人数・「メールで」「それまで」", () => {
    const out = applicationConfirmationEmail(BASE_PROPS);
    expect(out.html).not.toContain("応募内容を確認する");
    expect(out.html).not.toContain("募集人数");
    expect(out.html).not.toContain("メールで");
    expect(out.html).not.toContain("それまで");
  });

  it("エリア / 応募人数 NULL は行ごと省略", () => {
    const out = applicationConfirmationEmail({
      ...BASE_PROPS,
      area: undefined,
      headcount: null,
    });
    expect(out.html).not.toContain("【エリア】");
    expect(out.html).not.toContain("【応募人数】");
  });
});

// ----------------------------------------------------------------------------
// §1.2.A 発注者宛キャンセル通知
// ----------------------------------------------------------------------------

describe("applicationCancelledControlEmail — §1.2.A", () => {
  const BASE = {
    recipientName: "山田工務店",
    jobTitle: "△△工事",
    contractorName: "××建設",
    tradeType: "型枠大工",
    headcount: 3,
    firstWorkDate: "2026/06/30",
    cancelledAt: "2026/06/18 14:30",
  };

  it("件名に「要対応」+ キャンセル者名 を含む", () => {
    const out = applicationCancelledControlEmail(BASE);
    expect(out.subject).toBe(
      "【ビジ友・要対応】××建設さんが発注をキャンセルしました",
    );
  });

  it("本文に宛名・案件名・キャンセル者・職種・人数・初回稼働日・キャンセル日時 を含む", () => {
    const out = applicationCancelledControlEmail(BASE);
    expect(out.html).toContain("山田工務店 様");
    expect(out.html).toContain("下記の応募が、応募者によりキャンセルされました。");
    expect(out.html).toContain("【案件名】 △△工事");
    expect(out.html).toContain("【キャンセル者】 ××建設");
    expect(out.html).toContain("【職種】 型枠大工");
    expect(out.html).toContain("【人数】 3人");
    expect(out.html).toContain("【初回稼働日】 2026/06/30");
    expect(out.html).toContain("【キャンセル日時】 2026/06/18 14:30");
  });

  it("入れない要素: カウンター・操作誘導文", () => {
    const out = applicationCancelledControlEmail(BASE);
    expect(out.html).not.toContain("残り");
    expect(out.html).not.toContain("代替の人員手配");
  });
});

// ----------------------------------------------------------------------------
// §1.2.B 受注者本人キャンセル控え
// ----------------------------------------------------------------------------

describe("applicationCancelledEmail — §1.2.B", () => {
  const BASE = {
    applicantName: "××建設",
    jobTitle: "△△工事",
    clientName: "株式会社□□建設",
    tradeType: "型枠大工",
    headcount: 3,
    firstWorkDate: "2026/06/30",
    cancelledAt: "2026/06/18 14:30",
  };

  it("件名は「受注キャンセル」を使用 (発注者視点語の「発注」を避ける)", () => {
    const out = applicationCancelledEmail(BASE);
    expect(out.subject).toBe(
      "【ビジ友】「△△工事」の受注キャンセルを受け付けました",
    );
    expect(out.subject).not.toContain("発注キャンセル");
  });

  it("本文 closing に「発注者にもキャンセルをお知らせしました」を含む", () => {
    const out = applicationCancelledEmail(BASE);
    expect(out.html).toContain("××建設 様");
    expect(out.html).toContain("下記の受注のキャンセルを受け付けました。");
    expect(out.html).toContain("【発注者】 株式会社□□建設");
    expect(out.html).toContain("発注者にもキャンセルをお知らせしました。");
  });
});

// ----------------------------------------------------------------------------
// §1.3.A スカウト辞退通知
// ----------------------------------------------------------------------------

describe("scoutDeclinedControlEmail — §1.3.A", () => {
  const BASE = {
    recipientName: "山田工務店",
    jobTitle: "△△工事",
    contractorName: "××建設",
    scoutSentDate: "2026/06/15",
    declinedAt: "2026/06/18 14:30",
  };

  it("件名に「要対応」を付けず、辞退者名を含む (軽いネガティブ事象)", () => {
    const out = scoutDeclinedControlEmail(BASE);
    expect(out.subject).toBe(
      "【ビジ友】××建設さんからスカウトを辞退されました",
    );
    expect(out.subject).not.toContain("要対応");
  });

  it("本文に案件名・辞退した受注者・スカウト送信日・辞退日時・closing を含む", () => {
    const out = scoutDeclinedControlEmail(BASE);
    expect(out.html).toContain("山田工務店 様");
    expect(out.html).toContain("下記のスカウトが辞退されました。");
    expect(out.html).toContain("【案件名】 △△工事");
    expect(out.html).toContain("【辞退した受注者】 ××建設");
    expect(out.html).toContain("【スカウト送信日】 2026/06/15");
    expect(out.html).toContain("【辞退日時】 2026/06/18 14:30");
    expect(out.html).toContain("他の受注者へのご検討をお願いいたします。");
  });

  it("入れない要素: 職種・エリア・辞退理由・スカウトメッセージ抜粋", () => {
    const out = scoutDeclinedControlEmail(BASE);
    expect(out.html).not.toContain("【職種】");
    expect(out.html).not.toContain("【エリア】");
    expect(out.html).not.toContain("【辞退理由】");
    expect(out.html).not.toContain("【メッセージ】");
  });
});

// ----------------------------------------------------------------------------
// §1.6.C 発注確定控え
// ----------------------------------------------------------------------------

describe("orderAcceptedControlEmail — §1.6.C", () => {
  const BASE = {
    recipientName: "山田工務店",
    jobTitle: "△△工事",
    contractorName: "××建設",
    tradeType: "型枠大工",
    headcount: 3,
    firstWorkDate: "2026/06/30",
    workEndDate: "2026/07/03",
    decidedAt: "2026/06/22 14:30",
  };

  it("件名は「発注を確定しました」", () => {
    const out = orderAcceptedControlEmail(BASE);
    expect(out.subject).toBe("【ビジ友】「△△工事」への発注を確定しました");
  });

  it("本文に宛名・案件名・受注者・職種・人数・初回稼働日・工期終了日・発注確定日時 を含む", () => {
    const out = orderAcceptedControlEmail(BASE);
    expect(out.html).toContain("山田工務店 様");
    expect(out.html).toContain("下記の案件について、発注を確定しました。");
    expect(out.html).toContain("【案件名】 △△工事");
    expect(out.html).toContain("【受注者】 ××建設");
    expect(out.html).toContain("【職種】 型枠大工");
    expect(out.html).toContain("【人数】 3人");
    expect(out.html).toContain("【初回稼働日】 2026/06/30");
    expect(out.html).toContain("【工期終了日（応募確定時）】 2026/07/03");
    expect(out.html).toContain("【発注確定日時】 2026/06/22 14:30");
  });

  it("工期終了日 / 人数 NULL は行ごと省略", () => {
    const out = orderAcceptedControlEmail({
      ...BASE,
      headcount: null,
      workEndDate: undefined,
    });
    expect(out.html).not.toContain("【人数】");
    expect(out.html).not.toContain("【工期終了日");
  });
});

// ----------------------------------------------------------------------------
// §1.6.D 発注見送り控え
// ----------------------------------------------------------------------------

describe("orderRejectedControlEmail — §1.6.D", () => {
  const BASE = {
    recipientName: "山田工務店",
    jobTitle: "△△工事",
    contractorName: "××建設",
    tradeType: "型枠大工",
    decidedAt: "2026/06/22 14:30",
  };

  it("件名は「発注を見送りました」", () => {
    const out = orderRejectedControlEmail(BASE);
    expect(out.subject).toBe("【ビジ友】「△△工事」への発注を見送りました");
  });

  it("本文に宛名・案件名・受注者・職種・対応日時 を含む。初回稼働日 / 工期終了日 は含めない", () => {
    const out = orderRejectedControlEmail(BASE);
    expect(out.html).toContain("山田工務店 様");
    expect(out.html).toContain("下記の案件について、発注を見送りました。");
    expect(out.html).toContain("【案件名】 △△工事");
    expect(out.html).toContain("【受注者】 ××建設");
    expect(out.html).toContain("【職種】 型枠大工");
    expect(out.html).toContain("【対応日時】 2026/06/22 14:30");
    expect(out.html).not.toContain("【初回稼働日】");
    expect(out.html).not.toContain("【工期終了日");
  });
});

// ----------------------------------------------------------------------------
// §1.7.B スカウト送信 control
// ----------------------------------------------------------------------------

describe("scoutSentBroadcastEmail — §1.7.B", () => {
  const BASE = {
    memberName: "佐藤次郎",
    contractorName: "××建設",
    jobTitle: "△△工事",
    messageExcerpt: "急募案件です。ぜひお願いします。",
    actualSenderName: "田中花子",
  };

  it("件名に案件名を含む (§1.7.A と非対称)", () => {
    const out = scoutSentBroadcastEmail(BASE);
    expect(out.subject).toBe(
      "【ビジ友】「△△工事」へのスカウトを送信しました",
    );
  });

  it("本文ブロック構造: スカウト内容 (送信先 / 案件名 / メッセージ) + 送信者 (個人名)", () => {
    const out = scoutSentBroadcastEmail(BASE);
    expect(out.html).toContain("佐藤次郎 様");
    expect(out.html).toContain("下記のスカウトを送信しました。");
    expect(out.html).toContain("【送信先】 ××建設");
    expect(out.html).toContain("【案件名】 △△工事");
    expect(out.html).toContain("【メッセージ】");
    expect(out.html).toContain("急募案件です");
    expect(out.html).toContain("【送信者】 田中花子");
  });

  it("メッセージ空なら【メッセージ】行を省略 (【案件名】の後に直接【送信者】)", () => {
    const out = scoutSentBroadcastEmail({ ...BASE, messageExcerpt: "" });
    expect(out.html).not.toContain("【メッセージ】");
    expect(out.html).toContain("【送信者】 田中花子");
  });
});

// ----------------------------------------------------------------------------
// §3.1.A 完了催促 (受注者→発注者)
// ----------------------------------------------------------------------------

describe("completionReportToClientEmail — §3.1.A", () => {
  const BASE = {
    recipientName: "山田工務店",
    contractorName: "田中花子",
    jobTitle: "△△工事",
    tradeType: "型枠大工",
    workEndDate: "2026/07/03",
    reportedAt: "2026/07/05 14:30",
  };

  it("件名に「要対応」+ 受注者名 を含む", () => {
    const out = completionReportToClientEmail(BASE);
    expect(out.subject).toBe(
      "【ビジ友・要対応】田中花子さんから完了報告が届きました",
    );
  });

  it("本文に「完了評価が届きました」+ 「作業報告と評価の入力をお願いします」を含む (M-06 用語使い分け)", () => {
    const out = completionReportToClientEmail(BASE);
    expect(out.html).toContain("山田工務店 様");
    expect(out.html).toContain("田中花子さんから完了評価が届きました");
    expect(out.html).toContain("作業報告と評価の入力をお願いします");
    expect(out.html).toContain("【案件名】 △△工事");
    expect(out.html).toContain("【受注者】 田中花子");
    expect(out.html).toContain("【職種】 型枠大工");
    expect(out.html).toContain("【工期終了日(応募確定時)】 2026/07/03");
    expect(out.html).toContain("【報告日時】 2026/07/05 14:30");
  });

  it("入れない要素: 評価点数・稼働状況・CTA リンク (バイアス防止)", () => {
    const out = completionReportToClientEmail(BASE);
    expect(out.html).not.toContain("評価点数");
    expect(out.html).not.toContain("稼働状況");
    expect(out.html).not.toContain("マイページから提出");
  });

  it("工期終了日 NULL は行ごと省略", () => {
    const out = completionReportToClientEmail({ ...BASE, workEndDate: undefined });
    expect(out.html).not.toContain("【工期終了日");
  });
});

// ----------------------------------------------------------------------------
// §3.1.B 完了催促 (発注者→受注者)
// ----------------------------------------------------------------------------

describe("completionReportToContractorEmail — §3.1.B", () => {
  const BASE = {
    applicantName: "田中花子",
    clientName: "山田工務店",
    jobTitle: "△△工事",
    tradeType: "型枠大工",
    workEndDate: "2026/07/03",
    reportedAt: "2026/07/05 14:30",
  };

  it("件名に「要対応」+ 発注者名 を含む", () => {
    const out = completionReportToContractorEmail(BASE);
    expect(out.subject).toBe(
      "【ビジ友・要対応】山田工務店さんから完了報告が届きました",
    );
  });

  it("本文に「完了評価が届きました」+「作業報告と評価の入力をお願いします」を含む", () => {
    const out = completionReportToContractorEmail(BASE);
    expect(out.html).toContain("田中花子 様");
    expect(out.html).toContain("山田工務店さんから完了評価が届きました");
    expect(out.html).toContain("作業報告と評価の入力をお願いします");
    expect(out.html).toContain("【案件名】 △△工事");
    expect(out.html).toContain("【発注者】 山田工務店");
    expect(out.html).toContain("【職種】 型枠大工");
    expect(out.html).toContain("【工期終了日(応募確定時)】 2026/07/03");
    expect(out.html).toContain("【報告日時】 2026/07/05 14:30");
  });
});
