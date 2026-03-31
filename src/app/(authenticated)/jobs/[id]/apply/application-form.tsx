"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { applyJobAction } from "@/app/(authenticated)/jobs/search-actions";
import { toast } from "sonner";

interface ApplicationFormProps {
  jobId: string;
}

export function ApplicationForm({ jobId }: ApplicationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [headcount, setHeadcount] = useState("");
  const [workingType, setWorkingType] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [message, setMessage] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [showConfirm, setShowConfirm] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validation
    const newErrors: Record<string, string> = {};
    if (!headcount || Number(headcount) < 1)
      newErrors.headcount = "1名以上を入力してください";
    if (!workingType) newErrors.workingType = "日程/働き方を入力してください";
    if (!preferredDate)
      newErrors.preferredDate = "初回稼働希望日を選択してください";
    if (!agreed) newErrors.agreed = "確認してください";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setShowConfirm(true);
  }

  function handleConfirmOk() {
    setShowConfirm(false);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("jobId", jobId);
      formData.set("headcount", headcount);
      formData.set("workingType", workingType);
      formData.set("preferredFirstWorkDate", preferredDate);
      if (message) formData.set("message", message);

      const result = await applyJobAction(formData);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setShowComplete(true);
    });
  }

  function handleCompleteOk() {
    setShowComplete(false);
    router.push("/applications");
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1">
          <Label>応募人数</Label>
          <Input
            type="number"
            min={1}
            placeholder="人数を入力"
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
          />
          {errors.headcount && (
            <p className="text-body-sm text-destructive">{errors.headcount}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>日程/働き方</Label>
          <Input
            placeholder="日程/働き方を入力"
            value={workingType}
            onChange={(e) => setWorkingType(e.target.value)}
          />
          {errors.workingType && (
            <p className="text-body-sm text-destructive">
              {errors.workingType}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label>初回稼働希望日</Label>
          <Input
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
          />
          {errors.preferredDate && (
            <p className="text-body-sm text-destructive">
              {errors.preferredDate}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label>申し送り</Label>
          <Textarea
            placeholder="申し送り事項があれば入力"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="agree"
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(checked === true)}
          />
          <Label htmlFor="agree" className="text-body-sm">
            上記内容を確認しました
          </Label>
        </div>
        {errors.agreed && (
          <p className="text-body-sm text-destructive">{errors.agreed}</p>
        )}

        <Button
          type="submit"
          disabled={isPending}
          className="w-full rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
        >
          応募する
        </Button>

        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => router.back()}
          className="w-full rounded-[47px] border-foreground text-foreground"
        >
          もどる
        </Button>
      </form>

      {/* Confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認</DialogTitle>
          </DialogHeader>
          <p className="text-body-md">この情報で応募して良いですか？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              キャンセル
            </Button>
            <Button onClick={handleConfirmOk} disabled={isPending}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete dialog */}
      <Dialog open={showComplete} onOpenChange={setShowComplete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>完了</DialogTitle>
          </DialogHeader>
          <p className="text-body-md">応募が完了しました。</p>
          <DialogFooter>
            <Button onClick={handleCompleteOk}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
