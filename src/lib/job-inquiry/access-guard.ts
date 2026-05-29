// ---------------------------------------------------------------------------
// 求人へのお問い合わせ アクセスガード（job-inquiry / CON-006 + Server Action 共通）
// ---------------------------------------------------------------------------
// CON-006 のボタン表示判定と submitJobInquiryAction のガード判定の「両方」が
// この関数を呼ぶことで、UI と Server Action の許可範囲を関数レベルで一致させる
// （CLAUDE.md「UI と Server Action の許可範囲一致」）。
//
// DB アクセスを内部に持たないピュア関数。判定に必要な値は呼び出し側で取得して
// 構造化された値として渡す（テスタビリティ確保）。

export interface JobInquiryViewer {
  id: string;
  role: string | null;
  // viewer が所属する組織 ID（organization_members.organization_id）。無所属は null
  organizationId: string | null;
}

export interface JobInquiryTarget {
  id: string;
  // users.deleted_at（退会済み判定）
  deletedAt: string | null;
  // 宛先 client が owner の組織 ID（organizations.id）。個人プランは null
  organizationId: string | null;
}

export type CanSendJobInquiryResult =
  | { ok: true }
  | { ok: false; reason: "deleted" | "self" | "same_org" | "admin" };

/**
 * 送信者(viewer)が宛先(target)に求人問い合わせを送れるかを判定する。
 *
 * 拒否条件（いずれかに該当でボタン非表示／送信拒否）:
 * - admin: 運用上、管理者は問い合わせを送らない
 * - deleted: 宛先が退会済み
 * - self: 宛先が自分自身
 * - same_org: 宛先が自社（同一 organization）の発注者
 */
export function canSendJobInquiry({
  viewer,
  target,
}: {
  viewer: JobInquiryViewer;
  target: JobInquiryTarget;
}): CanSendJobInquiryResult {
  if (viewer.role === "admin") {
    return { ok: false, reason: "admin" };
  }
  if (target.deletedAt) {
    return { ok: false, reason: "deleted" };
  }
  if (viewer.id === target.id) {
    return { ok: false, reason: "self" };
  }
  if (
    viewer.organizationId !== null &&
    target.organizationId !== null &&
    viewer.organizationId === target.organizationId
  ) {
    return { ok: false, reason: "same_org" };
  }
  return { ok: true };
}
