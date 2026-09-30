
import { ScoutTemplateForm } from "../scout-template-form";
import { requireUser } from "@/lib/auth/require-user";

export default async function ScoutTemplateNewPage() {
  await requireUser();

  return (
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        スカウトテンプレート新規登録
      </h1>
      <div className="mt-6">
        <ScoutTemplateForm mode="create" />
      </div>
      </div>
    </div>
  );
}
