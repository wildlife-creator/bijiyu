"use client";

import { type ReactNode, useState, createContext, useContext, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const SheetCloseContext = createContext<(() => void) | null>(null);

export function useSheetClose() {
  return useContext(SheetCloseContext);
}

interface SearchFilterSheetProps {
  children: ReactNode;
  trigger?: ReactNode;
}

export function SearchFilterSheet({ children, trigger }: SearchFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

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
        <div className="space-y-4 py-4">
          <SheetCloseContext.Provider value={close}>
            {children}
          </SheetCloseContext.Provider>
        </div>
      </SheetContent>
    </Sheet>
  );
}
