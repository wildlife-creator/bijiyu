-- ============================================================
-- email-recycle-on-delete spec / Task 10
-- 既存の deleted_at IS NOT NULL ユーザーへの一括バックフィル
--
-- 投入時刻について: 本 migration は **深夜・低トラフィック時間帯を推奨**。
-- 理由: Phase 3 forward 経路（applyDeletedSuffix）と同時間帯に走らせると、
--   - 直前に「印付け済み」になった行も WHERE 正規表現で skip 判定 → 二重印付け回避
--   - しかし forward 経路が新規ユーザーを削除した瞬間にバックフィルがそのレコードに
--     当たる極小タイミング窓は理論上存在する。実害は無いが念のため低トラフィック帯。
--
-- 配置位置: Task 3 のトリガー v2 (20260617110000) より timestamp 後、
-- grant migration (20260617120000) より前を厳守 (=> 20260617110300)。
-- バックフィルが先に走るとトリガー v1 のままなので public.users.email が
-- 印付き値で同期上書きされ history が壊れる。
--
-- ランダム長について: 8 文字 (md5 から先頭 8 文字)。
--   - forward 経路は 4 文字 (1 回ごとに retry 可能なので 65,536 で十分)
--   - バックフィルは 1 回限りの一括 UPDATE で retry が効かないため、
--     1,000 件規模では 4 文字は確実に衝突する
--     (16^4 = 65,536、誕生日問題で 65,536 種類 vs 1,000 件 → 衝突確率 0.76%)
--   - 8 文字 (16^8 ≈ 43 億) なら 1 万件入っても衝突確率は実質ゼロ
--
-- 冪等性: WHERE 句の正規表現 `[a-z0-9]{4,}` が forward 4 文字と
-- バックフィル 8 文字の両方をマッチするため、再実行しても二重印付けされない。
-- ============================================================

DO $$
DECLARE
  v_target_count integer;
BEGIN
  SELECT count(*)::int INTO v_target_count
    FROM auth.users
   WHERE id IN (SELECT id FROM public.users WHERE deleted_at IS NOT NULL)
     AND email !~ '^deleted-\d{8}-[a-z0-9]{4,}-';
  RAISE NOTICE '[email_recycle_backfill] 対象件数: %', v_target_count;
END $$;

UPDATE auth.users
   SET email = 'deleted-'
             || to_char(now() at time zone 'UTC', 'YYYYMMDD')
             || '-'
             || substring(md5(random()::text || id::text || clock_timestamp()::text), 1, 8)
             || '-'
             || split_part(email, '@', 1)
             || '@'
             || split_part(email, '@', 2)
 WHERE id IN (SELECT id FROM public.users WHERE deleted_at IS NOT NULL)
   AND email !~ '^deleted-\d{8}-[a-z0-9]{4,}-';
