/**
 * メッセージング UI の共有型。
 *
 * 旧 `message-list.tsx` が型とコンポーネントの両方を抱えていたが、
 * `MessageList` コンポーネントは dead code だったため削除し、型のみを
 * 本ファイルへ切り出した（`src/components/area/types.ts` と同じ方針）。
 *
 * import 元: `MessageThreadView` / `/messages/[threadId]` page /
 * `src/lib/messaging/fetch-scout-job.ts`
 */

import type { AreaForDisplay } from "@/lib/utils/format-areas";

export interface ScoutJobInfo {
  id: string;
  title: string;
  tradeTypes: string[];
  headcount: number | null;
  recruitEndDate: string | null;
  rewardLower: number | null;
  rewardUpper: number | null;
  /** master-area: scout 対象案件のエリア配列 */
  areas: AreaForDisplay[];
  /** 稼働期間（職人が実際に働く期間） */
  workStartDate: string | null;
  workEndDate: string | null;
  /** 掲載終了(status='closed')案件のとき true */
  isClosed?: boolean;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  image_url: string | null;
  signed_image_url?: string | null;
  job_id: string | null;
  is_scout: boolean;
  is_proxy: boolean;
  read_at: string | null;
  scout_status: string | null;
  created_at: string;
  scout_job?: ScoutJobInfo | null;
}
