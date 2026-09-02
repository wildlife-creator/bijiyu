"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  VideoPlacement,
  VideoProvider,
  VideoStatus,
} from "@/lib/videos/constants";

import { VideoAddForm } from "./video-add-form";
import { VideoItem } from "./video-item";

export interface VideoItemData {
  id: string;
  placement: VideoPlacement;
  provider: VideoProvider;
  status: VideoStatus;
  adminLabel: string | null;
  /** Cloudflare UID または埋込元 URL（運営向けの識別表示用） */
  source: string;
  thumbnailUrl: string | null;
  createdAt: string;
}

interface VideoGroup {
  placement: VideoPlacement;
  label: string;
  description: string;
  videos: VideoItemData[];
}

interface VideoManagerProps {
  userId: string;
  displayName: string;
  isDeleted: boolean;
  backHref: string;
  defaultPlacement: VideoPlacement;
  cloudflareEnabled: boolean;
  groups: VideoGroup[];
}

/**
 * ADM-027 動画管理の画面本体（掲載場所タブ + 動画リスト + 追加フォーム + もどる）。
 * データ更新後は router.refresh() で Server Component（サムネ含む）を再描画する。
 */
export function VideoManager({
  userId,
  displayName,
  isDeleted,
  backHref,
  defaultPlacement,
  cloudflareEnabled,
  groups,
}: VideoManagerProps) {
  const router = useRouter();
  const [placement, setPlacement] = useState<VideoPlacement>(defaultPlacement);

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        ユーザー動画管理
      </h1>
      <p className="mt-2 text-center text-body-md text-foreground">
        {displayName}
        {isDeleted && (
          <span className="ml-2 text-body-sm font-bold text-muted-foreground">
            ※退会済み
          </span>
        )}
      </p>

      <Tabs
        value={placement}
        onValueChange={(v) => setPlacement(v as VideoPlacement)}
        className="mt-6 flex flex-col gap-2"
      >
        <TabsList className="h-10 w-full bg-primary/[0.08]">
          {groups.map((g) => (
            <TabsTrigger
              key={g.placement}
              value={g.placement}
              className="flex-1 text-body-sm data-[state=active]:bg-background data-[state=active]:font-bold data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              {g.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {groups.map((g) => (
          <TabsContent key={g.placement} value={g.placement} className="mt-2">
            <p className="text-body-xs text-muted-foreground">{g.description}</p>
            <section className="mt-4">
              <h2 className="text-body-sm font-bold">
                登録済みの動画（{g.videos.length}本）
              </h2>
              {g.videos.length === 0 ? (
                <p className="mt-2 rounded-[8px] border border-border/20 bg-background p-4 text-body-sm text-muted-foreground">
                  まだ動画が登録されていません
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-3">
                  {g.videos.map((v, index) => (
                    <VideoItem
                      key={v.id}
                      video={v}
                      position={index + 1}
                      total={g.videos.length}
                      onChanged={() => router.refresh()}
                    />
                  ))}
                </ul>
              )}
            </section>

            {!isDeleted && (
              <section className="mt-8">
                <h2 className="text-body-sm font-bold">動画を追加する</h2>
                <VideoAddForm
                  userId={userId}
                  placement={g.placement}
                  cloudflareEnabled={cloudflareEnabled}
                  onAdded={() => router.refresh()}
                />
              </section>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(backHref)}
          className="w-full max-w-xs rounded-full"
        >
          もどる
        </Button>
      </div>
    </div>
  );
}
