import { LegalText } from "@/components/legal/legal-text";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LegalArticle, LegalBlock } from "@/lib/legal/types";

interface LegalArticleSectionProps {
  article: LegalArticle;
}

/** 「第N条（見出し）」+ その本文ひとまとまりを描画する。 */
export function LegalArticleSection({ article }: LegalArticleSectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-heading-md font-bold">{article.title}</h2>
      <LegalBlocks blocks={article.blocks} />
    </section>
  );
}

interface LegalBlocksProps {
  blocks: LegalBlock[];
}

/** 見出しを伴わない本文だけを描画する（前文・末尾の署名など）。 */
export function LegalBlocks({ blocks }: LegalBlocksProps) {
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="text-body-md">
          <LegalText>{block.text}</LegalText>
        </p>
      );

    case "subheading":
      return <h3 className="pt-2 text-body-base font-bold">{block.text}</h3>;

    case "list":
      return (
        <ol className="list-outside list-decimal space-y-2 pl-5 text-body-md marker:text-muted-foreground">
          {block.items.map((item) => (
            <li key={item} className="pl-1">
              <LegalText>{item}</LegalText>
            </li>
          ))}
        </ol>
      );

    case "contact":
      return (
        <div className="space-y-1 rounded-lg bg-muted px-4 py-3 text-body-md">
          {block.lines.map((line) => (
            <p key={line}>
              <LegalText>{line}</LegalText>
            </p>
          ))}
        </div>
      );

    case "table":
      return (
        // 3 列あり SP 幅では収まらないため、Table 側の overflow-x-auto に
        // 横スクロールさせる（min-w を外すと文字が潰れて読めなくなる）。
        <Table className="min-w-xl text-body-md">
          <TableHeader>
            <TableRow>
              {block.headers.map((header) => (
                <TableHead key={header} className="font-bold text-foreground">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {block.rows.map((row) => (
              <TableRow key={row[0]}>
                {row.map((cell) => (
                  <TableCell key={cell} className="align-top whitespace-normal">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
  }
}
