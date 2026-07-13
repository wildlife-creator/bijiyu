import type Stripe from "stripe";

/**
 * Stripe の Subscription から課金期間の開始 / 終了日時を ISO 文字列で取り出す。
 *
 * API version 2025-03-31.basil 以降、`current_period_start` / `current_period_end`
 * は Subscription 本体から Subscription **item**（`items.data[0]`）配下へ移動した。
 * 一方、Webhook イベントの payload は「エンドポイントに設定された API version」で
 * レンダリングされるため、SDK 直呼び（新 version）と Webhook（エンドポイントが
 * 旧 version のまま残っている場合）で値の階層が食い違うことがある。
 * どちらに入っていても取りこぼさないよう、item 階層を優先しつつ本体階層へ
 * フォールバックする。
 *
 * この堅牢化を怠ると、Webhook が届いているのに `current_period_end` が null の
 * まま保存され、「解約予定日が画面・メールに出ない」不具合につながる。
 */

function unixToIso(value: unknown): string | null {
  return typeof value === "number"
    ? new Date(value * 1000).toISOString()
    : null;
}

export function extractPeriodStart(sub: Stripe.Subscription): string | null {
  const itemLevel = sub.items?.data?.[0]?.current_period_start;
  const topLevel = (sub as unknown as { current_period_start?: number })
    .current_period_start;
  return unixToIso(itemLevel) ?? unixToIso(topLevel);
}

export function extractPeriodEnd(sub: Stripe.Subscription): string | null {
  const itemLevel = sub.items?.data?.[0]?.current_period_end;
  const topLevel = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  return unixToIso(itemLevel) ?? unixToIso(topLevel);
}
