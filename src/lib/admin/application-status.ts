import type { Database } from "@/types/database";

/**
 * admin 専用8分類（ADM-013 / ADM-014）の単一情報源。
 *
 * 【前提（必ず守ること）】両者の評価が揃うと applications.status は
 * completed / lost に自動遷移する（applications/actions.ts の既存実装）。
 * この前提により「accepted のまま残っている行＝評価未完」が保証され、
 * 全分類が WHERE 句で表現できる。この前提が崩れる変更を入れる場合は
 * 本モジュールの再設計が必要。
 *
 * DB の status は変更せず、status＋初回稼働日＋cancelled_by から分類を計算する
 * （保存しない派生値）。バッジ表示は classifyAdminApplication、
 * 一覧のフィルタは applyCategoryFilter を使い、判定のズレを構造的に防ぐ。
 *
 * 当日判定は JST 日付文字列（YYYY-MM-DD）の比較で統一する。
 * today は呼び出し側から注入する（テスト容易性・タイムゾーン制御）。
 */

type ApplicationStatus = Database["public"]["Enums"]["application_status"];

export type AdminApplicationCategory =
  | "applied"
  | "accepted_before_start"
  | "review_pending"
  | "completed"
  | "lost"
  | "cancelled_by_contractor"
  | "cancelled_by_admin"
  | "rejected";

export const ADMIN_APPLICATION_CATEGORY_LABELS: Record<
  AdminApplicationCategory,
  string
> = {
  applied: "応募中",
  accepted_before_start: "発注済み・初回稼働日前",
  review_pending: "評価未入力",
  completed: "取引完了",
  lost: "取引不成立",
  cancelled_by_contractor: "ユーザー側からのキャンセル",
  cancelled_by_admin: "運営によるキャンセル",
  rejected: "発注側からのお断り",
};

/**
 * 行バッジ用の純粋関数。応募1件を8分類に振り分ける。
 * @param today JST の日付文字列（YYYY-MM-DD）
 */
export function classifyAdminApplication(
  app: {
    status: ApplicationStatus;
    first_work_date: string | null;
    cancelled_by: "contractor" | "admin" | null;
  },
  today: string,
): AdminApplicationCategory {
  switch (app.status) {
    case "applied":
      return "applied";
    case "accepted":
      // first_work_date 未確定（null）は「発注済み・初回稼働日前」に含める
      if (app.first_work_date === null || app.first_work_date >= today) {
        return "accepted_before_start";
      }
      return "review_pending";
    case "completed":
      return "completed";
    case "lost":
      return "lost";
    case "cancelled":
      // cancelled_by null は旧データ（受注者キャンセルのみ可能だった時期）
      return app.cancelled_by === "admin"
        ? "cancelled_by_admin"
        : "cancelled_by_contractor";
    case "rejected":
      return "rejected";
  }
}

/** applyCategoryFilter が必要とする最小のクエリ操作（Supabase query builder 互換） */
interface CategoryFilterableQuery {
  eq(column: string, value: string): this;
  lt(column: string, value: string): this;
  or(filters: string): this;
}

/**
 * フィルタ用: 分類 → Supabase query への WHERE 条件適用。
 * classifyAdminApplication と同じ判定基準を WHERE 句に変換する
 * （全条件サーバー側・post-filter 禁止・count 正確のため）。
 */
export function applyCategoryFilter<Q extends CategoryFilterableQuery>(
  query: Q,
  category: AdminApplicationCategory,
  today: string,
): Q {
  switch (category) {
    case "applied":
      return query.eq("status", "applied");
    case "accepted_before_start":
      return query
        .eq("status", "accepted")
        .or(`first_work_date.is.null,first_work_date.gte.${today}`);
    case "review_pending":
      return query.eq("status", "accepted").lt("first_work_date", today);
    case "completed":
      return query.eq("status", "completed");
    case "lost":
      return query.eq("status", "lost");
    case "cancelled_by_contractor":
      return query
        .eq("status", "cancelled")
        .or("cancelled_by.eq.contractor,cancelled_by.is.null");
    case "cancelled_by_admin":
      return query.eq("status", "cancelled").eq("cancelled_by", "admin");
    case "rejected":
      return query.eq("status", "rejected");
  }
}

/**
 * 発注取消ボタンの表示/実行可否。
 * UI（ADM-014 のボタン表示）と Server Action（再評価）で同一関数を使うこと。
 * = 発注済みかつ初回稼働日前（未確定含む）のみ取消可能
 */
export function canAdminCancel(
  app: { status: ApplicationStatus; first_work_date: string | null },
  today: string,
): boolean {
  return (
    app.status === "accepted" &&
    (app.first_work_date === null || app.first_work_date >= today)
  );
}
