import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  buildExistingDeprecatedMunicipalitiesByPrefecture,
  getAllMasterRows,
  getMunicipalitiesByPrefecture,
  getMunicipalitySortOrderMap,
} from "@/lib/master/fetch";
import { collapseAreasFromDb } from "@/lib/master/area-conversion";

import { ProfileEditForm } from "./profile-edit-form";

/**
 * Task 13.5: 法人プラン Owner が /profile/edit を開いたときに
 * 「契約者引き継ぎは運営経由」の注意バナーを表示する。
 *
 * 編集機能自体は一切制限しない。同一人物の改姓・メール変更は通常通り保存可。
 */
export default async function ProfileEditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 3 マスタ取得 (active 候補 + 廃止判定セット)
  const [
    allTradeTypes,
    allQualifications,
    allSkillTags,
    candidateMunicipalitiesByPrefecture,
    municipalitySortOrderMap,
  ] = await Promise.all([
    getAllMasterRows("trade-types"),
    getAllMasterRows("qualifications"),
    getAllMasterRows("skill-tags"),
    getMunicipalitiesByPrefecture(),
    getMunicipalitySortOrderMap(),
  ]);
  const activeTradeTypes = allTradeTypes
    .filter((r) => !r.deprecated_at)
    .map((r) => r.label);
  const activeQualifications = allQualifications
    .filter((r) => !r.deprecated_at)
    .map((r) => r.label);
  const activeSkillTags = allSkillTags
    .filter((r) => !r.deprecated_at)
    .map((r) => r.label);
  const deprecatedTradeSet = allTradeTypes
    .filter((r) => r.deprecated_at)
    .map((r) => r.label);
  const deprecatedQualSet = allQualifications
    .filter((r) => r.deprecated_at)
    .map((r) => r.label);
  const deprecatedTagSet = allSkillTags
    .filter((r) => r.deprecated_at)
    .map((r) => r.label);

  // 法人プラン Owner 判定
  const [subResult, memberResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_type")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("org_role")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const planType = subResult.data?.plan_type ?? null;
  const isCorporate =
    planType === "corporate" || planType === "corporate_premium";
  const isOwner = memberResult.data?.org_role === "owner";
  const showOwnerBanner = isCorporate && isOwner;

  // 既存登録の deprecated muni を allow-list として AreaListEditor に渡す。
  // form 側でも fetchProfile() で再取得するが、deprecated 判定は master の
  // 状態に依存するため Server 側で確定値を計算しておく。
  const { data: existingAreas } = await supabase
    .from("user_available_areas")
    .select("prefecture, municipality")
    .eq("user_id", user.id);
  const collapsedAreas = collapseAreasFromDb(
    (existingAreas ?? []).map((r) => ({
      prefecture: r.prefecture,
      municipality: r.municipality,
    })),
    municipalitySortOrderMap,
  );
  const existingDeprecatedMunicipalitiesByPrefecture =
    await buildExistingDeprecatedMunicipalitiesByPrefecture(
      collapsedAreas.flatMap((row) =>
        row.municipalities.map((m) => ({
          prefecture: row.prefecture,
          municipality: m,
        })),
      ),
    );

  return (
    <>
      {showOwnerBanner && (
        <div className="mx-auto mt-4 max-w-2xl px-4">
          <div className="rounded-[8px] border border-primary/30 bg-primary/5 px-4 py-3">
            <p className="text-body-sm text-foreground">
              氏名・メールアドレスの変更は同一人物の情報更新のみです。契約者
              （管理責任者）を別の方に引き継ぐ場合は、
              <Link
                href="/contact"
                className="ml-1 underline text-primary"
              >
                お問い合わせ
              </Link>
              からご依頼ください
            </p>
          </div>
        </div>
      )}
      <ProfileEditForm
        activeTradeTypes={activeTradeTypes}
        activeQualifications={activeQualifications}
        activeSkillTags={activeSkillTags}
        deprecatedTradeSet={deprecatedTradeSet}
        deprecatedQualSet={deprecatedQualSet}
        deprecatedTagSet={deprecatedTagSet}
        candidateMunicipalitiesByPrefecture={
          candidateMunicipalitiesByPrefecture
        }
        municipalitySortOrderMap={municipalitySortOrderMap}
        existingDeprecatedMunicipalitiesByPrefecture={
          existingDeprecatedMunicipalitiesByPrefecture
        }
      />
    </>
  );
}
