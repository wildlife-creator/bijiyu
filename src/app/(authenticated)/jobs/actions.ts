"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  jobSchema,
  validateJobImageFile,
  validateJobImageCount,
  ALLOWED_TRANSITIONS,
} from "@/lib/validations/job";
import type { ActionResult } from "@/lib/types/action-result";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFormDataToJobInput(formData: FormData) {
  return {
    title: formData.get("title") as string,
    description: formData.get("description") as string,
    tradeType: formData.get("tradeType") as string,
    rewardLower: Number(formData.get("rewardLower")),
    rewardUpper: Number(formData.get("rewardUpper")),
    prefecture: formData.get("prefecture") as string,
    address: (formData.get("address") as string) ?? "",
    workStartDate: formData.get("workStartDate") as string,
    workEndDate: formData.get("workEndDate") as string,
    recruitStartDate: formData.get("recruitStartDate") as string,
    recruitEndDate: formData.get("recruitEndDate") as string,
    headcount: Number(formData.get("headcount")),
    workHours: (formData.get("workHours") as string) ?? "",
    experienceYears: (formData.get("experienceYears") as string) ?? "",
    requiredSkills: (formData.get("requiredSkills") as string) ?? "",
    nationalityLanguage:
      (formData.get("nationalityLanguage") as string) ?? "",
    items: (formData.get("items") as string) ?? "",
    scheduleDetail: (formData.get("scheduleDetail") as string) ?? "",
    projectDetails: (formData.get("projectDetails") as string) ?? "",
    ownerMessage: (formData.get("ownerMessage") as string) ?? "",
    location: (formData.get("location") as string) ?? "",
    etcMessage: (formData.get("etcMessage") as string) ?? "",
    status: (formData.get("status") as string) ?? "draft",
  };
}

/**
 * Check if the individual plan user can open a new job.
 * Returns true if allowed, false if limit reached.
 */
async function checkOpenJobLimit(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  planType: string
): Promise<boolean> {
  if (planType !== "individual") return true;

  const { count } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("status", "open")
    .is("deleted_at", null);

  return (count ?? 0) < 1;
}

// ---------------------------------------------------------------------------
// createJobAction
// ---------------------------------------------------------------------------
export async function createJobAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        error: "認証情報が見つかりません。再度ログインしてください。",
      };
    }

    // Check user role
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userData || (userData.role !== "client" && userData.role !== "staff")) {
      return {
        success: false,
        error: "案件を作成する権限がありません。",
      };
    }

    // Get organization membership (if any)
    const { data: orgMember } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Check subscription
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status, plan_type")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .maybeSingle();

    if (!subscription) {
      return {
        success: false,
        error:
          "有効なサブスクリプションがありません。プランに加入してください。",
      };
    }

    // Validate form data
    const raw = parseFormDataToJobInput(formData);
    const parsed = jobSchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message;
      return {
        success: false,
        error: firstError ?? "入力内容に不備があります",
      };
    }

    const data = parsed.data;

    // Individual plan limit check (only if status is 'open')
    if (data.status === "open") {
      const canOpen = await checkOpenJobLimit(
        supabase,
        user.id,
        subscription.plan_type
      );
      if (!canOpen) {
        return {
          success: false,
          error:
            "掲載上限（1件）に達しています。既存の募集中案件を締切にしてから再度お試しください",
        };
      }
    }

    // Insert job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        owner_id: user.id,
        organization_id: orgMember?.organization_id ?? null,
        title: data.title,
        description: data.description,
        trade_type: data.tradeType,
        reward_lower: data.rewardLower,
        reward_upper: data.rewardUpper,
        prefecture: data.prefecture,
        address: data.address || null,
        work_start_date: data.workStartDate,
        work_end_date: data.workEndDate,
        recruit_start_date: data.recruitStartDate,
        recruit_end_date: data.recruitEndDate,
        headcount: data.headcount,
        work_hours: data.workHours || null,
        experience_years: data.experienceYears || null,
        required_skills: data.requiredSkills || null,
        nationality_language: data.nationalityLanguage || null,
        items: data.items || null,
        schedule_detail: data.scheduleDetail || null,
        project_details: data.projectDetails || null,
        owner_message: data.ownerMessage || null,
        location: data.location || null,
        etc_message: data.etcMessage || null,
        status: data.status,
      })
      .select("id")
      .single();

    if (jobError || !job) {
      return {
        success: false,
        error: "案件の保存に失敗しました。時間をおいて再度お試しください",
      };
    }

    // Upload images
    const imageFiles = formData.getAll("images") as File[];
    const validImages = imageFiles.filter(
      (f) => f instanceof File && f.size > 0
    );

    if (validImages.length > 0) {
      const countError = validateJobImageCount(0, validImages.length);
      if (countError) {
        return { success: true, data: { id: job.id } };
      }

      for (let i = 0; i < validImages.length; i++) {
        const file = validImages[i];
        const fileError = validateJobImageFile(file);
        if (fileError) {
          continue;
        }

        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${user.id}/${job.id}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("job-attachments")
          .upload(path, file);

        if (uploadError) {
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("job-attachments").getPublicUrl(path);

        await supabase.from("job_images").insert({
          job_id: job.id,
          image_url: publicUrl,
          image_type: "photo",
          sort_order: i,
        });
      }
    }

    return { success: true, data: { id: job.id } };
  } catch {
    return {
      success: false,
      error: "案件の保存に失敗しました。時間をおいて再度お試しください",
    };
  }
}

// ---------------------------------------------------------------------------
// updateJobAction
// ---------------------------------------------------------------------------
export async function updateJobAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        error: "認証情報が見つかりません。再度ログインしてください。",
      };
    }

    const jobId = formData.get("jobId") as string;
    if (!jobId) {
      return { success: false, error: "案件IDが指定されていません" };
    }

    // Fetch existing job to check ownership and current status
    const { data: existingJob } = await supabase
      .from("jobs")
      .select("id, owner_id, organization_id, status")
      .eq("id", jobId)
      .is("deleted_at", null)
      .single();

    if (!existingJob) {
      return { success: false, error: "案件が見つかりません" };
    }

    // Validate form data
    const raw = parseFormDataToJobInput(formData);
    const parsed = jobSchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message;
      return {
        success: false,
        error: firstError ?? "入力内容に不備があります",
      };
    }

    const data = parsed.data;

    // Validate status transition
    const currentStatus = existingJob.status;
    const newStatus = data.status;

    if (currentStatus !== newStatus) {
      const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(newStatus)) {
        return {
          success: false,
          error: "この操作は現在のステータスでは実行できません",
        };
      }

      // Check individual plan limit on draft -> open transition
      if (currentStatus === "draft" && newStatus === "open") {
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("plan_type")
          .eq("user_id", user.id)
          .in("status", ["active", "past_due"])
          .maybeSingle();

        if (subscription) {
          const canOpen = await checkOpenJobLimit(
            supabase,
            user.id,
            subscription.plan_type
          );
          if (!canOpen) {
            return {
              success: false,
              error:
                "掲載上限（1件）に達しています。既存の募集中案件を締切にしてから再度お試しください",
            };
          }
        }
      }
    }

    // Update job
    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        title: data.title,
        description: data.description,
        trade_type: data.tradeType,
        reward_lower: data.rewardLower,
        reward_upper: data.rewardUpper,
        prefecture: data.prefecture,
        address: data.address || null,
        work_start_date: data.workStartDate,
        work_end_date: data.workEndDate,
        recruit_start_date: data.recruitStartDate,
        recruit_end_date: data.recruitEndDate,
        headcount: data.headcount,
        work_hours: data.workHours || null,
        experience_years: data.experienceYears || null,
        required_skills: data.requiredSkills || null,
        nationality_language: data.nationalityLanguage || null,
        items: data.items || null,
        schedule_detail: data.scheduleDetail || null,
        project_details: data.projectDetails || null,
        owner_message: data.ownerMessage || null,
        location: data.location || null,
        etc_message: data.etcMessage || null,
        status: data.status,
      })
      .eq("id", jobId);

    if (updateError) {
      return {
        success: false,
        error: "案件の保存に失敗しました。時間をおいて再度お試しください",
      };
    }

    // Upload new images
    const imageFiles = formData.getAll("images") as File[];
    const validImages = imageFiles.filter(
      (f) => f instanceof File && f.size > 0
    );

    if (validImages.length > 0) {
      // Get existing image count
      const { count: existingCount } = await supabase
        .from("job_images")
        .select("*", { count: "exact", head: true })
        .eq("job_id", jobId);

      const countError = validateJobImageCount(
        existingCount ?? 0,
        validImages.length
      );
      if (countError) {
        return {
          success: false,
          error: countError,
        };
      }

      const startOrder = existingCount ?? 0;

      for (let i = 0; i < validImages.length; i++) {
        const file = validImages[i];
        const fileError = validateJobImageFile(file);
        if (fileError) {
          continue;
        }

        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${user.id}/${jobId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("job-attachments")
          .upload(path, file);

        if (uploadError) {
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("job-attachments").getPublicUrl(path);

        await supabase.from("job_images").insert({
          job_id: jobId,
          image_url: publicUrl,
          image_type: "photo",
          sort_order: startOrder + i,
        });
      }
    }

    return { success: true, data: { id: jobId } };
  } catch {
    return {
      success: false,
      error: "案件の保存に失敗しました。時間をおいて再度お試しください",
    };
  }
}

// ---------------------------------------------------------------------------
// deleteJobImage
// ---------------------------------------------------------------------------
export async function deleteJobImageAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        error: "認証情報が見つかりません。再度ログインしてください。",
      };
    }

    const imageId = formData.get("imageId") as string;
    const jobId = formData.get("jobId") as string;

    if (!imageId || !jobId) {
      return { success: false, error: "必要なパラメータが不足しています" };
    }

    // Get image info
    const { data: image } = await supabase
      .from("job_images")
      .select("id, image_url, job_id")
      .eq("id", imageId)
      .eq("job_id", jobId)
      .single();

    if (!image) {
      return { success: false, error: "画像が見つかりません" };
    }

    // Get job to check ownership
    const { data: job } = await supabase
      .from("jobs")
      .select("owner_id, organization_id")
      .eq("id", jobId)
      .single();

    if (!job) {
      return { success: false, error: "案件が見つかりません" };
    }

    // Extract storage path from URL
    const storagePath = image.image_url.split("/job-attachments/").pop();

    if (storagePath) {
      // Check if the file was uploaded by this user (path starts with userId)
      const isOwnFile = storagePath.startsWith(user.id);

      if (isOwnFile) {
        // Delete with user's client (Storage RLS allows own folder)
        await supabase.storage
          .from("job-attachments")
          .remove([storagePath]);
      } else if (job.organization_id) {
        // Corporate plan: verify same org membership, use admin client
        const orgId = job.organization_id;
        const { data: orgCheck } = await supabase.rpc("is_same_org", {
          org_id: orgId,
          uid: user.id,
        });

        if (orgCheck) {
          const adminClient = createAdminClient();
          await adminClient.storage
            .from("job-attachments")
            .remove([storagePath]);
        } else {
          return {
            success: false,
            error: "この画像を削除する権限がありません",
          };
        }
      } else {
        return {
          success: false,
          error: "この画像を削除する権限がありません",
        };
      }
    }

    // Delete DB record
    const { error: deleteError } = await supabase
      .from("job_images")
      .delete()
      .eq("id", imageId);

    if (deleteError) {
      return {
        success: false,
        error: "画像の削除に失敗しました。時間をおいて再度お試しください",
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: "画像の削除に失敗しました。時間をおいて再度お試しください",
    };
  }
}
