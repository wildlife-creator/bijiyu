-- pgTAP: 廃止済みの動画カラムが無くなり、会員の users 更新（書き込み保護トリガー経由）が引き続き動く
BEGIN;
SELECT plan(4);

SELECT hasnt_column('public', 'users', 'video_url', 'users.video_url は削除済み');
SELECT hasnt_column('public', 'client_profiles', 'workplace_video_url', 'client_profiles.workplace_video_url は削除済み');

-- guard_users_member_write から video_url の参照が外れていること（残っていると全 UPDATE が失敗する）
SELECT ok(
  position('video_url' in pg_get_functiondef('public.guard_users_member_write()'::regprocedure)) = 0,
  'guard_users_member_write は video_url を参照しない'
);

-- 会員（seed の contractor）が自分の自己紹介を更新できる
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
SELECT lives_ok(
  $$UPDATE public.users SET bio = '更新テスト' WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '会員は自分の users 行を更新できる（トリガーが列の削除後も動く）'
);
RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
