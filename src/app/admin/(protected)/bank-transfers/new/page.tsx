import Link from "next/link";

import { Button } from "@/components/ui/button";
import { isCompensationOptionEnabled } from "@/lib/billing/options";

import { CreateRequestForm } from "./create-request-form";

/**
 * ADM-025-B 銀行振込申込の登録（運営による代理登録、P9）。
 *
 * 料金プラン画面の「銀行振込で申し込む」ボタンは既定で非表示（NEXT_PUBLIC_BANK_TRANSFER_SELF_SERVICE_ENABLED）
 * のため、会員からのお問い合わせを受けた運営がここで申込を作る。登録後は ADM-026 の既存の流れ
 * （請求書送付済 → 入金確認して有効化 → 期限バッジ・期限通知）に乗る。
 */
export default function AdminBankTransferNewPage() {
  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        銀行振込申込の登録
      </h1>
      <p className="mt-3 text-center text-body-sm text-muted-foreground">
        お問い合わせで銀行振込のご希望を受けた会員の申込を、運営が代わりに登録します。
        <br />
        登録すると申込者へ「請求書をお送りします」の控えメールが届き、申込一覧に「申込受付」として並びます。
      </p>

      <div className="mx-auto mt-6 max-w-xl rounded-[8px] border border-border/20 bg-background p-5">
        <CreateRequestForm compensationEnabled={isCompensationOptionEnabled()} />
      </div>

      <div className="mt-6 flex justify-center">
        <Button variant="outline" className="w-full max-w-xs rounded-full" asChild>
          <Link href="/admin/bank-transfers">申込一覧へもどる</Link>
        </Button>
      </div>
    </div>
  );
}
