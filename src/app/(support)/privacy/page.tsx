import {
  LegalArticleSection,
  LegalBlocks,
} from "@/components/legal/legal-article-section";
import { BackButton } from "@/components/shared/back-button";
import {
  PRIVACY_ARTICLES,
  PRIVACY_CLOSING,
  PRIVACY_PREAMBLE,
} from "./content";

export default function PrivacyPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        プライバシーポリシー
      </h1>

      <LegalBlocks blocks={PRIVACY_PREAMBLE} />

      {PRIVACY_ARTICLES.map((article) => (
        <LegalArticleSection key={article.title} article={article} />
      ))}

      <LegalBlocks blocks={PRIVACY_CLOSING} />

      <div className="flex flex-col items-center gap-4 pt-4">
        <BackButton className="w-full rounded-full" />
      </div>
    </div>
  );
}
