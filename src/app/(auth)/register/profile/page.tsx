import {
  getAllMasterRows,
  getMunicipalitiesByPrefecture,
} from "@/lib/master/fetch";
import { RegisterProfileForm } from "./register-profile-form";

export default async function RegisterProfilePage() {
  const [allTradeTypes, municipalitiesByPrefecture] = await Promise.all([
    getAllMasterRows("trade-types"),
    getMunicipalitiesByPrefecture(),
  ]);
  const activeTradeTypes = allTradeTypes
    .filter((r) => !r.deprecated_at)
    .map((r) => r.label);
  const deprecatedTradeSet = allTradeTypes
    .filter((r) => r.deprecated_at)
    .map((r) => r.label);

  return (
    <RegisterProfileForm
      activeTradeTypes={activeTradeTypes}
      deprecatedTradeSet={deprecatedTradeSet}
      candidateMunicipalitiesByPrefecture={municipalitiesByPrefecture}
    />
  );
}
