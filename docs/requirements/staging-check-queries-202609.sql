-- ステージング Supabase Studio > SQL Editor に貼り付けて実行（すべて SELECT のみ）
-- 対象プロジェクト: bijiyu-staging (mfrlsbnqybvkzwsmiolm)

-- ============================================================
-- Q1【確認-2】各アカウントの退会ブロック要因（open 案件 / accepted 応募）
-- ============================================================
select
  u.id, u.email, u.role, u.deleted_at,
  (select count(*) from jobs j where j.owner_id = u.id and j.status = 'open' and j.deleted_at is null) as open_jobs,
  (select count(*) from jobs j where j.owner_id = u.id and j.status = 'closed' and j.deleted_at is null) as closed_jobs,
  (select count(*) from jobs j where j.owner_id = u.id and j.status = 'draft' and j.deleted_at is null) as draft_jobs,
  (select count(*) from applications a join jobs j on j.id = a.job_id where j.owner_id = u.id and a.status = 'accepted') as accepted_as_client,
  (select count(*) from applications a where a.applicant_id = u.id and a.status = 'accepted') as accepted_as_contractor,
  (select count(*) from applications a where a.applicant_id = u.id and a.status = 'applied') as applied_as_contractor
from users u
order by u.created_at desc;

-- ============================================================
-- Q2【確認-2】案件一覧（状態・所有者・組織・掲載期間）
-- ============================================================
select j.id, j.title, j.status, j.deleted_at, j.recruit_start_date, j.recruit_end_date,
       j.work_start_date, j.work_end_date, u.email as owner_email, j.organization_id, j.updated_at
from jobs j join users u on u.id = j.owner_id
order by j.created_at desc;

-- ============================================================
-- Q3【確認-4】応募の状態一覧（受注者 × 案件 × status）
-- ============================================================
select a.id as application_id, a.status, a.created_at as applied_at, a.updated_at,
       a.first_work_date, a.work_location, a.rejection_reason, a.cancelled_by,
       j.title as job_title, j.status as job_status,
       ap.email as applicant_email, ow.email as job_owner_email
from applications a
join jobs j on j.id = a.job_id
join users ap on ap.id = a.applicant_id
join users ow on ow.id = j.owner_id
order by a.created_at desc;

-- ============================================================
-- Q4【確認-5】スカウトメッセージ（送信者・受信側・scout_status・案件状態）
-- ============================================================
select m.id as message_id, m.created_at, m.scout_status, m.job_id,
       j.title as job_title, j.status as job_status, j.deleted_at as job_deleted_at,
       s.email as sender_email, s.role as sender_role,
       t.id as thread_id, t.thread_type, t.organization_id,
       p1.email as participant_1, p2.email as participant_2,
       t.organization_1_id, t.organization_2_id
from messages m
join message_threads t on t.id = m.thread_id
join users s on s.id = m.sender_id
left join jobs j on j.id = m.job_id
left join users p1 on p1.id = t.participant_1_id
left join users p2 on p2.id = t.participant_2_id
where m.is_scout = true
order by m.created_at desc;

-- ============================================================
-- Q5【確認-16】組織あてスレッドと組織メンバー
-- ============================================================
select t.id as thread_id, t.thread_type, t.updated_at,
       t.organization_id, t.organization_1_id, t.organization_2_id,
       p1.email as participant_1, p2.email as participant_2,
       (select string_agg(mu.email || '(' || om.org_role || case when om.is_proxy_account then ',proxy' else '' end || ')', ', ')
          from organization_members om join users mu on mu.id = om.user_id
         where om.organization_id = coalesce(t.organization_id, t.organization_1_id, t.organization_2_id)) as org_members
from message_threads t
left join users p1 on p1.id = t.participant_1_id
left join users p2 on p2.id = t.participant_2_id
order by t.updated_at desc;

-- ============================================================
-- Q6【確認-3】本人確認申請（書類パス・状態）
-- ============================================================
select iv.id, u.email, iv.status, iv.document_type, iv.document_url_1, iv.document_url_2,
       iv.created_at, iv.updated_at, iv.reviewed_at, u.identity_verified, u.avatar_url
from identity_verifications iv join users u on u.id = iv.user_id
order by iv.created_at desc;

-- ============================================================
-- Q7【確認-1】契約中プラン（価格突合の参考）
-- ============================================================
select u.email, s.plan_type, s.billing_cycle, s.payment_method, s.status, s.current_period_end
from subscriptions s join users u on u.id = s.user_id
order by s.created_at desc;
