"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StarRatingInput } from "@/components/shared/star-rating-input";
import { submitClientReportAction } from "@/app/(authenticated)/applications/actions";
import { CONTRACTOR_OPERATING_STATUS_OPTIONS } from "@/lib/validations/matching";
import {
  NOT_APPLICABLE_HINT,
  RATING_ITEMS,
  type RatingItemKey,
} from "@/lib/constants/rating";

interface ClientReportFormProps {
  applicationId: string;
}

// snake_case のカラム名 → FormData / Server Action が期待する camelCase 名へ変換
function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function ClientReportForm({ applicationId }: ClientReportFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operatingStatus, setOperatingStatus] = useState("");
  const [ratings, setRatings] = useState<Record<RatingItemKey, number | null>>(
    Object.fromEntries(RATING_ITEMS.map((item) => [item.key, null])) as Record<
      RatingItemKey,
      number | null
    >,
  );
  // 「該当なし」選択状態（道具項目のみ意味を持つ。保存上は未評価と同じ NULL）
  const [notApplicable, setNotApplicable] = useState<
    Record<RatingItemKey, boolean>
  >(
    Object.fromEntries(RATING_ITEMS.map((item) => [item.key, false])) as Record<
      RatingItemKey,
      boolean
    >,
  );

  function setRating(key: RatingItemKey, value: number | null) {
    setRatings((prev) => ({ ...prev, [key]: value }));
  }

  function setNa(key: RatingItemKey, value: boolean) {
    setNotApplicable((prev) => ({ ...prev, [key]: value }));
  }

  // 送信可否: 総合評価 + 稼働状況が必須
  const canSubmit = operatingStatus !== "" && ratings.rating_overall !== null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("applicationId", applicationId);
    formData.set("operatingStatus", operatingStatus);
    for (const item of RATING_ITEMS) {
      const value = ratings[item.key];
      formData.set(toCamel(item.key), value === null ? "" : String(value));
    }

    const result = await submitClientReportAction(formData);

    if (result.success) {
      router.push("/applications/orders");
    } else {
      setError(result.error);
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      {/* Work report section */}
      <section>
        <h2 className="text-body-lg font-bold text-foreground">作業報告</h2>

        <div className="mt-3 space-y-2">
          <Label className="text-body-md font-bold">
            稼働状況 <span className="text-destructive text-body-sm">必須</span>
          </Label>
          <Select value={operatingStatus} onValueChange={setOperatingStatus}>
            <SelectTrigger className="w-full rounded-[8px] bg-background">
              <SelectValue placeholder="お選びください" />
            </SelectTrigger>
            <SelectContent>
              {CONTRACTOR_OPERATING_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 space-y-1">
          <Label htmlFor="statusSupplement" className="text-body-md">
            稼働状況の補足
          </Label>
          <Textarea
            id="statusSupplement"
            name="statusSupplement"
            className="rounded-[8px] bg-background"
          />
        </div>
      </section>

      {/* Rating section: 7項目★×5（総合のみ必須） */}
      <section>
        <h2 className="text-body-lg font-bold text-foreground">評価入力</h2>

        <div className="mt-3 space-y-4">
          {RATING_ITEMS.map((item) => {
            const allowNa =
              "allowNotApplicable" in item && item.allowNotApplicable === true;
            return (
              <div key={item.key} className="border-b border-border pb-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="text-body-md text-foreground">
                    {item.label}
                    {item.required && (
                      <span className="ml-1 text-destructive text-body-sm">
                        必須
                      </span>
                    )}
                  </span>
                  <StarRatingInput
                    value={ratings[item.key]}
                    onChange={(v) => setRating(item.key, v)}
                    ariaLabel={item.label}
                    allowNotApplicable={allowNa}
                    notApplicable={notApplicable[item.key]}
                    onNotApplicableChange={(v) => setNa(item.key, v)}
                  />
                </div>
                {allowNa && (
                  <p className="mt-1.5 text-body-sm text-muted-foreground">
                    {NOT_APPLICABLE_HINT}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Comment */}
      <div className="space-y-1">
        <Label htmlFor="comment" className="text-body-md">
          評価の補足
        </Label>
        <Textarea
          id="comment"
          name="comment"
          placeholder="持っている道具の名前、具体的な評価の内容などをご記入ください"
          className="rounded-[8px] bg-background"
        />
      </div>

      {error && <p className="text-body-sm text-destructive">{error}</p>}

      <div className="mx-auto flex w-full max-w-xs flex-col gap-3">
        <Button
          type="submit"
          className="w-full rounded-pill text-body-md border-primary"
          disabled={isLoading || !canSubmit}
        >
          {isLoading ? "送信中..." : "評価を登録する"}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full rounded-pill text-body-md"
          onClick={() => router.back()}
        >
          もどる
        </Button>
      </div>
    </form>
  );
}
