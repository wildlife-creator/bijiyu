import { LegalArticleSection } from "@/components/legal/legal-article-section";
import { BackButton } from "@/components/shared/back-button";
import { LEGAL_ARTICLES } from "./content";

export default function LegalPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        特定商取引法に基づく表記
      </h1>

      {LEGAL_ARTICLES.map((article) => (
        <LegalArticleSection key={article.title} article={article} />
      ))}

      <div className="flex flex-col items-center gap-4 pt-4">
        <BackButton className="w-full rounded-full" />
      </div>
    </div>
  );
}
