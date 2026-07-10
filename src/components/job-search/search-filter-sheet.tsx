"use client";

import {
  type ReactNode,
  useState,
  createContext,
  useContext,
  useCallback,
  useMemo,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PendingOverlay } from "@/components/shared/pending-overlay";

interface SheetContextValue {
  /** Sheet を閉じる */
  close: () => void;
  /** 検索実行: 遷移を useTransition で包み、遷移中は isPending を立てる */
  navigate: (href: string) => void;
  /** 遷移中フラグ（検索ボタンの非活性・オーバーレイ表示に使う） */
  isPending: boolean;
}

const SheetContext = createContext<SheetContextValue | null>(null);

/** Sheet を閉じる関数（後方互換）。 */
export function useSheetClose() {
  return useContext(SheetContext)?.close ?? null;
}

/** Sheet の close / navigate / isPending をまとめて取得する。 */
export function useSheetContext() {
  return useContext(SheetContext);
}

interface SearchFilterSheetProps {
  children: ReactNode;
  trigger?: ReactNode;
}

export function SearchFilterSheet({ children, trigger }: SearchFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const close = useCallback(() => setOpen(false), []);
  // 遷移を useTransition で包む。Sheet を閉じても本コンポーネント（＝オーバーレイと
  // isPending）は SheetContent の外側で生き残るため、閉じた後もローディング表示が続く。
  const navigate = useCallback(
    (href: string) => {
      startTransition(() => router.push(href));
    },
    [router],
  );

  const value = useMemo<SheetContextValue>(
    () => ({ close, navigate, isPending }),
    [close, navigate, isPending],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" aria-label="検索条件">
            <img
              src="/images/icons/icon-search.png"
              alt=""
              className="w-5 h-5"
            />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>検索条件</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 py-4">
          <SheetContext.Provider value={value}>
            {children}
          </SheetContext.Provider>
        </div>
      </SheetContent>
      <PendingOverlay active={isPending} />
    </Sheet>
  );
}
