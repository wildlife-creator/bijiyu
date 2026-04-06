"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThumbsUp, ThumbsDown } from "lucide-react";
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
import { submitClientReportAction } from "@/app/(authenticated)/applications/actions";
import { CONTRACTOR_OPERATING_STATUS_OPTIONS } from "@/lib/validations/matching";

interface ClientReportFormProps {
  applicationId: string;
}

const RATING_ITEMS = [
  { name: "ratingAgain", label: "また依頼したいか？" },
  { name: "ratingFollowsInstructions", label: "指示通りに動けるか？" },
  { name: "ratingPunctual", label: "稼働予定日にちゃんと来たか？" },
  { name: "ratingSpeed", label: "作業は速いか？" },
  { name: "ratingQuality", label: "作業は丁寧か？" },
  { name: "ratingHasTools", label: "必要な道具を持っているか？" },
] as const;

export function ClientReportForm({ applicationId }: ClientReportFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operatingStatus, setOperatingStatus] = useState("");
  const [ratings, setRatings] = useState<Record<string, string>>({});

  function setRating(name: string, value: string) {
    setRatings((prev) => ({ ...prev, [name]: value }));
  }

  const allRatingsFilled = RATING_ITEMS.every((item) => ratings[item.name]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("applicationId", applicationId);
    formData.set("operatingStatus", operatingStatus);

    // Set ratings
    for (const item of RATING_ITEMS) {
      formData.set(item.name, ratings[item.name] ?? "");
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
            <SelectTrigger className="w-full rounded-[8px]">
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
            className="rounded-[8px]"
          />
        </div>
      </section>

      {/* Rating section */}
      <section>
        <h2 className="text-body-lg font-bold text-foreground">評価入力</h2>

        <div className="mt-3 space-y-3">
          {RATING_ITEMS.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between border-b border-border pb-3"
            >
              <span className="text-body-md text-foreground">{item.label}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRating(item.name, "good")}
                  className={`rounded-full p-2 transition-colors ${
                    ratings[item.name] === "good" ? "text-primary" : "text-gray-400"
                  }`}
                  aria-label={`${item.label} Good`}
                >
                  <ThumbsUp className="size-6" fill={ratings[item.name] === "good" ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  onClick={() => setRating(item.name, "bad")}
                  className={`rounded-full p-2 transition-colors ${
                    ratings[item.name] === "bad" ? "text-primary" : "text-gray-400"
                  }`}
                  aria-label={`${item.label} Bad`}
                >
                  <ThumbsDown className="size-6" fill={ratings[item.name] === "bad" ? "currentColor" : "none"} />
                </button>
              </div>
            </div>
          ))}
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
          className="rounded-[8px]"
        />
      </div>

      {error && <p className="text-body-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        className="w-full rounded-pill"
        disabled={isLoading || !operatingStatus || !allRatingsFilled}
      >
        {isLoading ? "送信中..." : "評価を登録する"}
      </Button>

      <Button
        type="button"
        variant="outline"
        className="w-full rounded-pill"
        onClick={() => router.back()}
      >
        もどる
      </Button>
    </form>
  );
}
