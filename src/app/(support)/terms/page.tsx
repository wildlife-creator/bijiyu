import {
  LegalArticleSection,
  LegalBlocks,
} from "@/components/legal/legal-article-section";
import { BackButton } from "@/components/shared/back-button";
import { TERMS_ARTICLES, TERMS_PREAMBLE } from "./content";

export default function TermsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">利用規約</h1>

      <LegalBlocks blocks={TERMS_PREAMBLE} />

      {TERMS_ARTICLES.map((article) => (
        <LegalArticleSection key={article.title} article={article} />
      ))}

      <div className="flex flex-col items-center gap-4 pt-4">
        <BackButton className="w-full rounded-full" />
      </div>
    </div>
  );
}
