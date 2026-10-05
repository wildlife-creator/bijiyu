import type { SupabaseClient } from "@supabase/supabase-js";

import { toApplicationDocumentPath } from "@/lib/order-details";
import type { Database } from "@/types/database";

export interface SignedApplicationDocument {
  /** applications.document_urls に保存されている値そのまま */
  entry: string;
  /** 表示用の Signed URL（1 時間有効） */
  url: string;
}

/**
 * 応募レベルの書類（非公開バケット application-documents）の Signed URL を作る。
 * 読めるかどうかは Storage の RLS（本人のフォルダ or 自分に見える応募が参照している）に任せる。
 * URL を作れなかったものは結果に含めない。
 */
export async function signApplicationDocuments(
  supabase: SupabaseClient<Database>,
  entries: readonly string[] | null | undefined,
): Promise<SignedApplicationDocument[]> {
  const signed: SignedApplicationDocument[] = [];
  for (const entry of entries ?? []) {
    const path = toApplicationDocumentPath(entry);
    if (!path) continue;
    const { data } = await supabase.storage
      .from("application-documents")
      .createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      signed.push({ entry, url: data.signedUrl });
    }
  }
  return signed;
}
