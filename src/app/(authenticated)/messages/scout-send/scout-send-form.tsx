"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BackButton } from "@/components/shared/back-button";
import { sendScoutAction } from "./actions";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  lastName: string;
  firstName: string;
  avatarUrl: string | null;
  age: number | null;
  identityVerified: boolean;
  ccusVerified: boolean;
  skills: string[];
  experienceYears: number | null;
}

interface Job {
  id: string;
  title: string;
}

interface ScoutTemplate {
  id: string;
  title: string;
  body: string;
}

interface ScoutSendFormProps {
  targetUserId: string;
  userProfile: UserProfile;
  jobs: Job[];
  templates: ScoutTemplate[];
}

export function ScoutSendForm({
  targetUserId,
  userProfile,
  jobs,
  templates,
}: ScoutSendFormProps) {
  const router = useRouter();
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setTitle(template.title);
      setBody(template.body);
    }
  }

  function handleSubmit() {
    if (!selectedJobId) {
      toast.error("案件を選択してください");
      return;
    }
    if (!title.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }
    if (!body.trim()) {
      toast.error("本文を入力してください");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("userId", targetUserId);
      formData.set("jobId", selectedJobId);
      formData.set("title", title.trim());
      formData.set("body", body.trim());

      const result = await sendScoutAction(formData);
      if (result.success) {
        toast.success("スカウトを送信しました");
        router.back();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-2xl px-4">
        <h1 className="py-4 text-center text-lg font-bold text-secondary">スカウト送信</h1>

        {/* User profile section */}
        <div className="mb-6 flex items-start gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
            {userProfile.avatarUrl ? (
              <img
                src={userProfile.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <img
                  src="/images/icons/icon-avatar.png"
                  alt=""
                  className="h-6 w-6 opacity-40"
                />
              </div>
            )}
          </div>
          <div>
            <p className="font-medium">
              {userProfile.lastName}　{userProfile.firstName}
              {userProfile.age !== null && `（${userProfile.age}歳）`}
            </p>
            {userProfile.skills.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {userProfile.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-[33px] bg-[rgba(146,7,131,0.08)] px-2 py-0.5 text-body-xs text-primary"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
            {userProfile.experienceYears !== null && (
              <p className="mt-1 text-body-xs text-muted-foreground">
                経験年数 {userProfile.experienceYears}年
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-2">
              {userProfile.identityVerified && (
                <span className="flex items-center gap-1 text-[11px]">
                  <img
                    src="/images/icons/icon-tag.png"
                    alt=""
                    className="h-3.5 w-3.5"
                  />
                  本人確認済み
                </span>
              )}
              {userProfile.ccusVerified && (
                <span className="flex items-center gap-1 text-[11px]">
                  <img
                    src="/images/icons/icon-tag.png"
                    alt=""
                    className="h-3.5 w-3.5"
                  />
                  CCUS登録済み
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Job select */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">
            募集する案件を選択
          </label>
          <Select value={selectedJobId} onValueChange={setSelectedJobId}>
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="お選びください" />
            </SelectTrigger>
            <SelectContent>
              {jobs.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Template select */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">
            スカウトテンプレートを選択
          </label>
          <Select
            value={selectedTemplateId}
            onValueChange={handleTemplateSelect}
          >
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="お選びください" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Title */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">タイトル</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ここにタイトルが入ります。"
            className="w-full bg-background"
          />
        </div>

        {/* Body */}
        <div className="mb-8">
          <label className="mb-2 block text-sm font-medium">本文</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="ここに本文が入ります。"
            rows={8}
            className="w-full bg-background"
          />
        </div>

        {/* Buttons */}
        <div className="flex flex-col items-center gap-3 pb-8">
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full rounded-full bg-primary text-white hover:bg-primary/90"
          >
            {isPending ? "送信中..." : "送信する"}
          </Button>
          <BackButton />
        </div>
      </div>
    </div>
  );
}
