"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveOrganizationNameAction } from "./actions";

export function OrganizationSetupForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("組織名を入力してください");
      return;
    }
    if (trimmed.length > 100) {
      setError("組織名は100文字以内で入力してください");
      return;
    }
    startTransition(async () => {
      const result = await saveOrganizationNameAction(trimmed);
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
      }
      // On success, action calls redirect() which throws NEXT_REDIRECT
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <div className="space-y-2">
        <Label htmlFor="org-name">組織名</Label>
        <Input
          id="org-name"
          type="text"
          placeholder="例: 株式会社ビジ友建設"
          className="bg-background"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
        />
        {error && (
          <p className="text-body-sm text-destructive">{error}</p>
        )}
      </div>
      <div className="flex justify-center">
        <Button
          type="submit"
          className="rounded-full px-12 text-white"
          disabled={pending || !name.trim()}
        >
          保存する
        </Button>
      </div>
    </form>
  );
}
