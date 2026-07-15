import { LegalText } from "@/components/legal/legal-text";
import { BackButton } from "@/components/shared/back-button";
import { FAQ_CATEGORIES } from "./content";

export default function FaqPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">よくある質問</h1>

      {FAQ_CATEGORIES.map((section) => (
        <section key={section.category} className="space-y-4">
          <h2 className="text-heading-md font-bold">{section.category}</h2>

          <div className="space-y-5">
            {section.items.map((item) => (
              <div key={item.question} className="space-y-1.5">
                <h3 className="text-body-base font-bold">{item.question}</h3>
                <p className="text-body-md">
                  <LegalText>{item.answer}</LegalText>
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex flex-col items-center gap-4 pt-4">
        <BackButton className="w-full rounded-full" />
      </div>
    </div>
  );
}
