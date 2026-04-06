"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  acceptApplicationAction,
  rejectApplicationAction,
} from "@/app/(authenticated)/applications/actions";

interface ExistingDocument {
  id: string;
  image_url: string;
}

interface DecisionFormProps {
  applicationId: string;
  defaultWorkLocation: string;
  existingDocuments: ExistingDocument[];
}

export function DecisionForm({
  applicationId,
  defaultWorkLocation,
  existingDocuments,
}: DecisionFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [decision, setDecision] = useState<"accept" | "reject" | null>(null);

  // Accept form fields
  const [workLocation, setWorkLocation] = useState(defaultWorkLocation);
  const [clientNotes, setClientNotes] = useState("");
  const [firstWorkDate, setFirstWorkDate] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);

  // Reject form fields
  const [rejectionReason, setRejectionReason] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files);
    setUploadedFiles((prev) => [...prev, ...newFiles]);

    // Generate previews
    newFiles.forEach((file) => {
      const url = URL.createObjectURL(file);
      setFilePreviews((prev) => [...prev, url]);
    });

    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  function removeFile(index: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    if (!decision) return;
    setIsLoading(true);
    setError(null);

    if (decision === "accept") {
      const formData = new FormData();
      formData.set("applicationId", applicationId);
      formData.set("workLocation", workLocation);
      formData.set("clientNotes", clientNotes);
      formData.set("firstWorkDate", firstWorkDate);

      // Append document files
      uploadedFiles.forEach((file) => {
        formData.append("documents", file);
      });

      const result = await acceptApplicationAction(formData);

      if (result.success) {
        setShowSuccess(true);
      } else {
        setError(result.error ?? "エラーが発生しました");
        setIsLoading(false);
      }
    } else if (decision === "reject") {
      const formData = new FormData();
      formData.set("applicationId", applicationId);
      formData.set("rejectionReason", rejectionReason);

      const result = await rejectApplicationAction(formData);

      if (result.success) {
        setShowSuccess(true);
      } else {
        setError(result.error ?? "エラーが発生しました");
        setIsLoading(false);
      }
    }
  }

  const canSubmit =
    decision === "reject" ||
    (decision === "accept" && workLocation.trim() !== "" && firstWorkDate !== "");

  return (
    <>
      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label className="text-body-lg font-bold">
            発注可否 <span className="text-destructive text-body-sm">必須</span>
          </Label>
          <Select
            value={decision ?? ""}
            onValueChange={(val) => setDecision(val as "accept" | "reject")}
          >
            <SelectTrigger className="rounded-[8px]">
              <SelectValue placeholder="お選びください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accept">発注を依頼する</SelectItem>
              <SelectItem value="reject">お断りする</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* CLI-009-B: Accept form */}
        {decision === "accept" && (
          <div className="space-y-4">
            <h2 className="text-body-lg font-bold text-foreground">
              勤務についての詳細
            </h2>
            <p className="text-body-sm text-muted-foreground">
              マッチング成立時にユーザーに表示される詳細な勤務内容です。マッチング後に入力することも可能です。
            </p>

            <div className="space-y-2">
              <Label className="text-body-md font-bold">
                勤務地 <span className="text-destructive text-body-sm">必須</span>
              </Label>
              <Input
                value={workLocation}
                onChange={(e) => setWorkLocation(e.target.value)}
                placeholder="東京都千代田区丸の内XX-XX"
                className="rounded-[8px]"
              />
            </div>

            {/* Document upload section */}
            <div className="space-y-2">
              <Label className="text-body-md font-bold">業務に関する書類</Label>

              {/* Existing job documents (read-only) */}
              {existingDocuments.length > 0 && (
                <div className="space-y-2">
                  {existingDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="overflow-hidden rounded-[8px] border border-border"
                    >
                      <img
                        src={doc.image_url}
                        alt="業務書類"
                        className="h-40 w-full object-contain bg-muted"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Upload area — hide camera placeholder when files are uploaded */}
              {filePreviews.length === 0 && (
                <div
                  className="flex h-40 cursor-pointer items-center justify-center rounded-[8px] border border-dashed border-border bg-background"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="size-12 text-muted-foreground/50" />
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* Uploaded file previews */}
              {filePreviews.length > 0 && (
                <div className="space-y-2">
                  {filePreviews.map((preview, i) => (
                    <div
                      key={i}
                      className="relative overflow-hidden rounded-[8px] border border-border"
                    >
                      <img
                        src={preview}
                        alt={`アップロード ${i + 1}`}
                        className="h-40 w-full object-contain bg-muted"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/50 text-white text-xs"
                        onClick={() => removeFile(i)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  書類を登録する
                </Button>
                <button
                  type="button"
                  className="text-body-sm text-foreground underline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  ＋追加する
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-body-md font-bold">その他</Label>
              <Textarea
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                placeholder="連絡事項を記入"
                className="rounded-[8px]"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-body-md font-bold">
                初回稼働日 <span className="text-destructive text-body-sm">必須</span>
              </Label>
              <Input
                type="date"
                value={firstWorkDate}
                onChange={(e) => setFirstWorkDate(e.target.value)}
                className="rounded-[8px]"
              />
            </div>
          </div>
        )}

        {/* CLI-009-C: Reject form */}
        {decision === "reject" && (
          <div className="space-y-2">
            <Label className="text-body-md font-bold">
              お断りの理由を入力ください
            </Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="連絡事項を記入"
              className="rounded-[8px]"
              rows={4}
            />
          </div>
        )}

        {error && <p className="text-body-sm text-destructive">{error}</p>}

        <Button
          className="w-full rounded-pill"
          disabled={!canSubmit || isLoading}
          onClick={handleSubmit}
        >
          {isLoading ? "送信中..." : "送信する"}
        </Button>

        <Button
          variant="outline"
          className="w-full rounded-pill"
          onClick={() => router.back()}
        >
          もどる
        </Button>
      </div>

      {/* Success dialog */}
      <AlertDialog open={showSuccess} onOpenChange={setShowSuccess}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>送信完了</AlertDialogTitle>
            <AlertDialogDescription>
              ユーザーへ結果を送信しました
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => router.push("/applications/received")}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
