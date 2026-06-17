/**
 * ADM-024: 代理メッセージ閲覧のメッセージリスト部。
 * 発注者側（右・代理バッジ付きあり）/ 受注者側（左）の吹き出しで時系列表示する。
 * 閲覧専用。将来 ADM-024 に入力欄＋代理送信を足す際は、このリストを
 * そのまま流用してページ側に送信フォームを追加する（分離の意図）。
 */

export interface ProxyMessageItem {
  id: string;
  body: string;
  /** message-attachments の署名付きURL（添付なし・生成失敗は null） */
  signedImageUrl: string | null;
  isProxy: boolean;
  /** true = 受注者（職人）側の発言。false = 発注者（組織）側の発言 */
  isContractorSide: boolean;
  /** formatDateTime 済みの表示用日時（生 ISO 禁止） */
  createdAt: string;
}

export function ProxyMessageList({
  messages,
  clientName,
  contractorName,
}: {
  messages: ProxyMessageItem[];
  clientName: string;
  contractorName: string;
}) {
  if (messages.length === 0) {
    return (
      <p className="px-4 py-6 text-body-sm text-muted-foreground">
        メッセージがありません
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex flex-col ${
            m.isContractorSide ? "items-start" : "items-end"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-body-sm font-medium text-muted-foreground">
              {m.isContractorSide ? contractorName : clientName}
            </span>
            {m.isProxy && (
              <span className="rounded-full border border-secondary bg-background px-2 py-0.5 text-xs font-bold text-secondary">
                代理
              </span>
            )}
          </div>
          <div
            className={`mt-1 max-w-[75%] rounded-[8px] px-3 py-2 ${
              m.isContractorSide
                ? "border border-border/20 bg-background"
                : "bg-[#F0E2EF]"
            }`}
          >
            {m.body && (
              <p className="whitespace-pre-wrap text-body-md text-foreground">
                {m.body}
              </p>
            )}
            {m.signedImageUrl && (
              <img
                src={m.signedImageUrl}
                alt="添付画像"
                className={`max-h-60 rounded-[8px] object-contain ${
                  m.body ? "mt-2" : ""
                }`}
              />
            )}
          </div>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {m.createdAt}
          </p>
        </div>
      ))}
    </div>
  );
}
