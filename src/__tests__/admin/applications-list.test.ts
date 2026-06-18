import { describe, expect, it } from "vitest";

import { buildApplicationsKeywordOr } from "@/lib/admin/applications-list";

/**
 * ADM-013 キーワード検索の OR 句組み立て（Task 10.1）。
 * PostgREST は空の in.() を構文エラーにするため、
 * 「空でない id 集合の枝だけ」で .or() 文字列を組み立てる。
 */

describe("buildApplicationsKeywordOr", () => {
  it("応募者・案件の両方の集合がある場合は2枝の OR を返す", () => {
    const result = buildApplicationsKeywordOr({
      applicantIds: ["u1", "u2"],
      jobIds: ["j1"],
    });
    expect(result).toBe("applicant_id.in.(u1,u2),job_id.in.(j1)");
  });

  it("応募者集合のみの場合は applicant_id 枝のみ（空の in.() を含めない）", () => {
    const result = buildApplicationsKeywordOr({
      applicantIds: ["u1"],
      jobIds: [],
    });
    expect(result).toBe("applicant_id.in.(u1)");
    expect(result).not.toContain("job_id");
  });

  it("案件集合のみの場合は job_id 枝のみ", () => {
    const result = buildApplicationsKeywordOr({
      applicantIds: [],
      jobIds: ["j1", "j2"],
    });
    expect(result).toBe("job_id.in.(j1,j2)");
    expect(result).not.toContain("applicant_id");
  });

  it("全集合が空の場合は null（クエリを発行せず0件を返すシグナル）", () => {
    const result = buildApplicationsKeywordOr({
      applicantIds: [],
      jobIds: [],
    });
    expect(result).toBeNull();
  });

  it("id の重複は除去される", () => {
    const result = buildApplicationsKeywordOr({
      applicantIds: ["u1", "u1"],
      jobIds: ["j1", "j1", "j2"],
    });
    expect(result).toBe("applicant_id.in.(u1),job_id.in.(j1,j2)");
  });
});
