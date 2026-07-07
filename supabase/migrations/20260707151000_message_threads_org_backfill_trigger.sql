-- ============================================================
-- Phase 2 Step 3 前提: 旧 organization_id を書く INSERT (scout-send /
-- bulk-send 等) が自動的に organization_1_id にも反映されるトリガー
-- ============================================================
--
-- 目的:
--   scout-send / bulk-send / 旧 messages/new など、旧 organization_id
--   カラムだけを set する既存コードを変更せずに、identity ペア UNIQUE 制約
--   および新 org カラム経由のクエリ (Step 3 以降) と整合させる。
--
-- ロジック:
--   - INSERT 時、organization_1_id / organization_2_id のどちらも未設定で、
--     organization_id が設定されているなら organization_1_id = organization_id
--     を自動セットする (participant_1 が org 側という慣例に従う)
--   - どちらかの新カラムが明示的に set されているなら trigger は何もしない
--     (Step 3+ の新コード用: 意図的に organization_2_id を使う "contractor→org"
--      パターン等を尊重する)
--
-- 慣例の根拠:
--   scout-send/actions.ts findOrCreateThread:
--     participant_1 = userId (creator = client 側送信者)
--     organization_id = organizationId (creator = client の org)
--   なので participant_1 は organization_id の org メンバー。
--
--   messages/new (Step 3 で修正) は identity ロジックに移行し新カラムを
--   明示 set するため trigger をバイパスする。
-- ============================================================

CREATE OR REPLACE FUNCTION public.backfill_message_threads_org_pair()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 新カラムが 1 つでも set されているなら、明示的な意図を尊重して何もしない
  IF NEW.organization_1_id IS NOT NULL OR NEW.organization_2_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 旧 organization_id が set されているなら participant_1 側慣例で backfill
  IF NEW.organization_id IS NOT NULL THEN
    NEW.organization_1_id := NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_backfill_message_threads_org_pair
  BEFORE INSERT ON public.message_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.backfill_message_threads_org_pair();

COMMENT ON FUNCTION public.backfill_message_threads_org_pair() IS
  'Phase 2 移行期間中の safety net: 旧 organization_id のみを set する INSERT で
   organization_1_id を自動 backfill する。新カラムを明示 set する新コードには影響しない。';
