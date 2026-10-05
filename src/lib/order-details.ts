// ---------------------------------------------------------------------------
// 発注内容（発注確定時に発注者が入力する 4 項目）の編集まわりの純粋関数
// ---------------------------------------------------------------------------
//
// 対象: applications.work_location / document_urls / client_notes / first_work_date
// UI（CLI-011 のボタン表示・CLI-011B のページガード）と Server Action
// （updateOrderDetailsAction）で同一関数を共有すること。

export type OrderDetailField =
  | "firstWorkDate"
  | "workLocation"
  | "documents"
  | "clientNotes";

/** メール・画面に出す項目名。並び順 = ORDER_DETAIL_FIELD_ORDER */
export const ORDER_DETAIL_FIELD_LABELS: Record<OrderDetailField, string> = {
  firstWorkDate: "初回稼働日",
  workLocation: "勤務地",
  documents: "業務に関する書類",
  clientNotes: "その他",
};

const ORDER_DETAIL_FIELD_ORDER: readonly OrderDetailField[] = [
  "firstWorkDate",
  "workLocation",
  "documents",
  "clientNotes",
];

/**
 * 発注者が発注内容を編集できるか。
 * = 発注確定（accepted）かつ、発注者・受注者のどちらも完了報告（評価）を出していない間。
 *   片方が完了報告を出しても status は accepted のままなので、評価の有無も見る
 *   （完了報告の後に初回稼働日を動かすと、評価の入力期間と食い違うため）。
 */
export function canEditOrderDetails(
  app: { status: string },
  reviews: { hasUserReview: boolean; hasClientReview: boolean },
): boolean {
  return (
    app.status === "accepted" &&
    !reviews.hasUserReview &&
    !reviews.hasClientReview
  );
}

export interface OrderDetailsSnapshot {
  workLocation: string | null;
  clientNotes: string | null;
  firstWorkDate: string | null;
  /** applications.document_urls（保存されている値そのまま。順序も比較する） */
  documents: readonly string[];
}

function normalizeText(value: string | null): string {
  return (value ?? "").trim();
}

/** 変更前後を比べ、変わった項目を表示順で返す。空配列 = 変更なし。 */
export function diffOrderDetails(
  before: OrderDetailsSnapshot,
  after: OrderDetailsSnapshot,
): OrderDetailField[] {
  const changed = new Set<OrderDetailField>();
  if ((before.firstWorkDate ?? "") !== (after.firstWorkDate ?? "")) {
    changed.add("firstWorkDate");
  }
  if (normalizeText(before.workLocation) !== normalizeText(after.workLocation)) {
    changed.add("workLocation");
  }
  if (normalizeText(before.clientNotes) !== normalizeText(after.clientNotes)) {
    changed.add("clientNotes");
  }
  if (
    before.documents.length !== after.documents.length ||
    before.documents.some((entry, i) => entry !== after.documents[i])
  ) {
    changed.add("documents");
  }
  return ORDER_DETAIL_FIELD_ORDER.filter((field) => changed.has(field));
}

/** 変更項目を「初回稼働日、勤務地」のような表示用文字列にする。 */
export function formatChangedOrderDetailFields(
  fields: readonly OrderDetailField[],
): string {
  return fields.map((field) => ORDER_DETAIL_FIELD_LABELS[field]).join("、");
}

const LEGACY_PUBLIC_URL_PATTERN =
  /\/object\/public\/application-documents\/(.+)$/;

/**
 * applications.document_urls の 1 件を application-documents バケット内のパスに直す。
 * 現行データはパスそのもの、旧データは公開 URL 形式で保存されている。
 * パスを取り出せない旧データは null。
 */
export function toApplicationDocumentPath(entry: string): string | null {
  if (!entry.startsWith("http")) return entry;
  const match = entry.match(LEGACY_PUBLIC_URL_PATTERN);
  return match ? match[1] : null;
}
