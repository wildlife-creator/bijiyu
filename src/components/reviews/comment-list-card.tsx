import { Card, CardContent } from "@/components/ui/card";

interface CommentListCardProps {
  title: string;
  /** 表示するコメント（ページング済みの1ページ分） */
  items: Array<{ id: string; text: string }>;
}

/**
 * 評価コメント一覧カード（「稼働状況の補足」「評価の補足」）。
 * 評価詳細ページ（/users/[id]/reviews）と ADM-009 で共用する。
 * ページングは <CommentsPagination> を併用する。
 */
export function CommentListCard({ title, items }: CommentListCardProps) {
  return (
    <Card className="gap-0 rounded-[8px] py-0">
      <CardContent className="p-0">
        <div className="border-b border-border bg-primary/10 px-4 py-3">
          <h2 className="text-body-md font-bold text-foreground">{title}</h2>
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-3">
            <p className="text-body-md text-muted-foreground">
              コメントはありません
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="border-b border-border px-4 py-3 last:border-b-0"
            >
              <p className="text-body-md text-foreground">{item.text}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
