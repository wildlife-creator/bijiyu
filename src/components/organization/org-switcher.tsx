"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setActiveOrganizationContext } from "@/lib/organization/set-active-org-context";

/**
 * proxy-account-multi-org-support Phase 7 / Task 7.2
 *
 * `OrgSwitcher`:
 *   N 組織兼任スタッフ向けの組織選択ドロップダウン。
 *
 * 表示条件 / 挙動（design.md 「暫定 UI スペック」準拠）:
 *   - `memberships.length > 1` のときのみ DOM 出力（単一組織ユーザーには非表示）
 *   - shadcn `<Select>` ベース、`w-[240px]`
 *   - 表示名は `client_profiles.display_name` 解決済（フォールバックは Owner 姓名 / "未設定"）
 *   - 切替時は `setActiveOrganizationContext` を呼び、成功なら `window.location.href = '/mypage'`、
 *     失敗ならトーストでエラー表示
 *   - 切替先は **常に `/mypage` 固定**（組織スコープ URL からの切替で権限エラー / 404 を防ぐ）
 *   - 並び順は呼び出し側で `created_at ASC` 解決済の `memberships` を受け取る
 *   - `aria-label="所属組織を切り替える"` をトリガーに付与
 *   - design.md 暫定スペックでは「現在: 」プレフィックスラベルを想定していたが、
 *     2026-06-24 の実機目視確認でヘッダー他要素（ロゴ / ハンバーガー）との縦中央
 *     軸ズレが目立つため削除（Select トリガーの選択値表示で「現在の組織」は自明）。
 *     design.md「暫定 UI スペック」セクションを同期更新済。
 *
 * 要件: 7.1, 7.2, 7.3, 7.4
 */

export interface OrgSwitcherMembership {
  organizationId: string;
  displayName: string;
}

interface OrgSwitcherProps {
  memberships: OrgSwitcherMembership[];
  activeOrgId: string | null;
}

export function OrgSwitcher({ memberships, activeOrgId }: OrgSwitcherProps) {
  const [isPending, startTransition] = useTransition();

  if (memberships.length <= 1) {
    return null;
  }

  function handleChange(orgId: string) {
    if (orgId === activeOrgId) return;
    startTransition(async () => {
      const result = await setActiveOrganizationContext(orgId);
      if (!result.success) {
        toast.error("組織の切り替えに失敗しました。もう一度お試しください。");
        return;
      }
      // 組織スコープ URL から切替時、同 URL リロードは新組織で権限エラー / 404 になるため、
      // Server Action 応答の redirectTo（'/mypage' 固定）にハードナビゲーション。
      // router.push() は Router Cache に古い RSC が残るため使わない。
      window.location.href = result.redirectTo;
    });
  }

  return (
    <div data-testid="org-switcher" className="sm:w-[240px]">
      <Select
        value={activeOrgId ?? undefined}
        onValueChange={handleChange}
        disabled={isPending}
      >
        <SelectTrigger
          aria-label="所属組織を切り替える"
          className="h-10 w-full bg-background"
        >
          <SelectValue placeholder="組織を選択" />
        </SelectTrigger>
        <SelectContent>
          {memberships.map((m) => (
            <SelectItem key={m.organizationId} value={m.organizationId}>
              {m.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
