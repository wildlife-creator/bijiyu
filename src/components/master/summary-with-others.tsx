/**
 * SummaryWithOthers (リストカード等の「主要 M 件 + 他」)
 *
 * CON-007 マイリスト・CLI-001 募集現場一覧・応募一覧/詳細など、
 * リストカード上で 3 マスタ項目（trade_types / skill_tags / qualifications）を
 * 「主要 M 件 + 他」表示する。
 *
 * 仕様:
 *   - items.length <= maxVisible のときは「他」を出さず全件表示
 *   - 件数の数値表示は行わない（「他 5 件」ではなく「他」のみ）
 *   - 区切り文字は既定で「、」
 *   - items.length === 0 のとき null を返す
 *
 * 注意:
 *   - サーバ・クライアントどちらでも使えるよう純粋なテキスト出力にとどめる
 *   - 手書きの slice(0, M).join("、") を散らさないため、表示画面では必ずこの部品を使う
 */

interface SummaryWithOthersProps {
  items: string[];
  maxVisible: number;
  separator?: string;
  /** 超過件数が 1 件以上のときに付与する suffix。既定は「 他」 */
  othersSuffix?: string;
  className?: string;
}

export function SummaryWithOthers({
  items,
  maxVisible,
  separator = "、",
  othersSuffix = " 他",
  className,
}: SummaryWithOthersProps) {
  if (items.length === 0) return null;
  if (items.length <= maxVisible) {
    return <span className={className}>{items.join(separator)}</span>;
  }
  const visible = items.slice(0, maxVisible).join(separator);
  return (
    <span className={className}>
      {visible}
      {othersSuffix}
    </span>
  );
}
