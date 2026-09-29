import { GENDERS } from "@/lib/constants/options";

/**
 * 性別（users.gender）の表示用フォーマット。
 *
 * users.gender は登録・編集フォームの選択肢（GENDERS = 男性 / 女性 / その他）を
 * そのまま日本語で保存している。選択肢に無い値・未設定は空文字を返す。
 *
 * 例:
 *   formatGender("男性") → "男性"
 *   formatGender(null)   → ""
 */
export function formatGender(gender: string | null | undefined): string {
  return (GENDERS as readonly string[]).includes(gender ?? "") ? (gender as string) : "";
}
