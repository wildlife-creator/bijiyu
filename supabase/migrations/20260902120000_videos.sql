-- ============================================================
-- 2026-09-02: 動画基盤（P4 / docs/requirements/spec-changes-202608.md §2.3、
--             docs/requirements/p4-video-implementation-notes.md）
--
-- 「追加のみ」のマイグレーション。
-- 1. 動画テーブル videos を新設（掲載先ユーザー × 掲載場所 × 表示順、複数本）
--    - provider='cloudflare': Cloudflare Stream にアップロードした MP4（UID を保持）
--    - provider='external' : TikTok 等の埋込 URL（parseVideoUrl が解釈する元 URL）
--    - status: cloudflare は 'processing' で作成し、Webhook / 状態確認で 'ready' へ
-- 2. 既存の users.video_url / client_profiles.workplace_video_url（TikTok URL）を
--    videos へコピー移行する。旧カラムは DROP しない（staging マージ時に 2 段階方式で廃止）
-- 3. 表示はオプション購入の有無でゲートしない（全ユーザーのページに掲載可能 = D4）。
--    購入・価格まわりは P7 / P8 の範囲で本マイグレーションでは触らない
-- ============================================================

-- ------------------------------------------------------------
-- 0. Enum（掲載場所は後から ALTER TYPE ... ADD VALUE で増やせる）
-- ------------------------------------------------------------
CREATE TYPE video_placement AS ENUM ('contractor_page', 'client_page');
CREATE TYPE video_status AS ENUM ('processing', 'ready');

-- ------------------------------------------------------------
-- 1. videos
-- ------------------------------------------------------------
CREATE TABLE videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- contractor_page=職人ページ（受注者PR動画）/ client_page=会社ページ（職場紹介動画）
  placement video_placement NOT NULL,
  -- 同一 (user_id, placement) 内の表示順（昇順）
  sort_order integer NOT NULL DEFAULT 0,
  provider text NOT NULL CHECK (provider IN ('cloudflare', 'external')),
  -- provider='cloudflare' のとき必須: Cloudflare Stream の動画 UID
  cloudflare_uid text,
  -- provider='external' のとき必須: 埋込元 URL（TikTok 等）
  embed_source_url text,
  -- 運営向けの管理用ラベル（自由入力・表示には使わない）
  admin_label text,
  -- processing=変換中（非公開）/ ready=公開
  status video_status NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT videos_provider_consistency CHECK (
    (provider = 'cloudflare' AND cloudflare_uid IS NOT NULL AND embed_source_url IS NULL)
    OR
    (provider = 'external' AND embed_source_url IS NOT NULL AND cloudflare_uid IS NULL)
  )
);

COMMENT ON TABLE videos IS
  'ユーザーページに掲載する動画（受注者PR動画 / 職場紹介動画）。1 行 = 1 本。管理者のみ登録・削除（ADM-027）。表示はオプション購入の有無でゲートしない';
COMMENT ON COLUMN videos.placement IS
  'contractor_page=職人ページ（COM-001 / CLI-006 / ADM-009）/ client_page=会社ページ（CON-006 / CLI-020 / ADM-004）';
COMMENT ON COLUMN videos.status IS
  'processing=Cloudflare で変換中（非公開）/ ready=公開。external は常に ready';

-- Cloudflare UID は 1 本 1 行（Webhook の uid → 行 引き当てに使う）
CREATE UNIQUE INDEX videos_cloudflare_uid_unique
  ON videos (cloudflare_uid)
  WHERE cloudflare_uid IS NOT NULL;

CREATE INDEX videos_user_placement_idx
  ON videos (user_id, placement, sort_order);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: ログイン済みユーザーは公開（ready）の動画を誰のものでも閲覧可。
--      処理中（processing）は管理者のみ。INSERT / UPDATE / DELETE は service_role
--      （管理画面の Server Action / Webhook）専用でポリシーを置かない。
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "videos_select_ready" ON videos
  FOR SELECT TO authenticated
  USING (status = 'ready');

CREATE POLICY "videos_select_admin" ON videos
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

GRANT ALL ON videos TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 2. 既存データの移行（旧カラムは残す）
-- ------------------------------------------------------------
INSERT INTO videos (user_id, placement, sort_order, provider, embed_source_url, status)
SELECT id, 'contractor_page', 0, 'external', video_url, 'ready'
FROM users
WHERE video_url IS NOT NULL AND btrim(video_url) <> '';

INSERT INTO videos (user_id, placement, sort_order, provider, embed_source_url, status)
SELECT user_id, 'client_page', 0, 'external', workplace_video_url, 'ready'
FROM client_profiles
WHERE workplace_video_url IS NOT NULL AND btrim(workplace_video_url) <> '';

COMMENT ON COLUMN users.video_url IS
  '【廃止予定】P4 で videos テーブルへ移行済み。アプリからは参照しない（staging マージ時に DROP）';
COMMENT ON COLUMN client_profiles.workplace_video_url IS
  '【廃止予定】P4 で videos テーブルへ移行済み。アプリからは参照しない（staging マージ時に DROP）';
