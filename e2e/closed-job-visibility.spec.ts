import { test, expect } from "@playwright/test";
import { login, TEST_CONTRACTOR, TEST_CONTRACTOR4 } from "./helpers";

// 掲載終了(status='closed')案件を、関係者(応募/お気に入り/スカウト)には見せ、
// 無関係な人には非公開のまま案内する挙動の E2E。
// 対象: jobs_select_related_closed ポリシー + 各画面の掲載終了表示。
//
// 既存 seed の掲載終了案件を再利用:
//   - 掲載終了案件 dd111111-...d0091「個人発注 キッチンリフォーム（完了）」
//     応募者 = contractor4 (accepted)。contractor は無関係。
// 完了報告テスト用の隔離データ:
//   - closed-report-contractor@test.local が accepted のまま掲載終了になった
//     案件 c105ed00-...ba01 に対し、完了報告を送信できること。

const CLOSED_JOB_ID = "dd111111-0000-0000-0000-0000000d0091";
const CLOSED_JOB_TITLE = "個人発注 キッチンリフォーム（完了）";

const REPORT_CONTRACTOR = {
  email: "closed-report-contractor@test.local",
  password: "testpass123",
};
const REPORT_APPLICATION_ID = "c105ed00-0000-4000-8000-00000000aa01";

test.describe("掲載終了案件の関係者向け表示", () => {
  test("応募した受注者の応募履歴に、掲載終了案件が『掲載終了』バッジ付きで正しく表示される（不明な案件にならない）", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR4.email, TEST_CONTRACTOR4.password);
    await page.goto("/applications/history");

    // 案件名が正しく表示される（RLS で読めず「不明な案件」になっていないこと）
    await expect(page.getByText(CLOSED_JOB_TITLE)).toBeVisible();
    await expect(page.getByText("不明な案件")).toHaveCount(0);
    // 「掲載終了」バッジが表示される
    await expect(page.getByText("掲載終了").first()).toBeVisible();
  });

  test("応募した受注者は掲載終了案件の詳細を読み取り専用で閲覧でき、応募ボタンは表示されない", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR4.email, TEST_CONTRACTOR4.password);
    await page.goto(`/jobs/${CLOSED_JOB_ID}`);

    // 案件の中身（タイトル）が見える
    await expect(page.getByText(CLOSED_JOB_TITLE)).toBeVisible();
    // 掲載終了が明示される
    await expect(page.getByText("この案件の募集は終了しました。")).toBeVisible();
    // 応募ボタンは出ない（応募不可）
    await expect(page.getByText("応募する")).toHaveCount(0);
  });

  test("無関係な受注者が掲載終了案件の直リンクを開くと、詳細は出さず『掲載終了しました』の案内になる（404にならない）", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/jobs/${CLOSED_JOB_ID}`);

    // 掲載終了の案内が出る
    await expect(page.getByText("この案件は掲載終了しました。")).toBeVisible();
    // 案件の中身（タイトル・報酬）は見せない（非公開のまま）
    await expect(page.getByText(CLOSED_JOB_TITLE)).toHaveCount(0);
    await expect(page.getByText("18,000")).toHaveCount(0);
  });
});

test.describe("掲載終了後の完了報告", () => {
  test("受注済みの案件が掲載終了になっても、受注者は完了報告・評価を送信できる", async ({
    page,
  }) => {
    await login(page, REPORT_CONTRACTOR.email, REPORT_CONTRACTOR.password);
    await page.goto(`/applications/history/${REPORT_APPLICATION_ID}/report`);

    // 入力フォームが表示される（案件の稼働終了日が読めず「期間外」で弾かれないこと）。
    // 送信ボタンが出ている = 期間外エラーではなくフォームが描画されている証拠。
    await expect(
      page.getByRole("button", { name: "作業報告・評価を登録する" }),
    ).toBeVisible();

    // 稼働状況を選択（shadcn Select は 2 段クリック。exact:true 必須 =
    // 「一部欠席したものの概ね問題なく稼働完了」への部分一致を避ける）
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "問題なく稼働完了", exact: true }).click();

    // 「また仕事を受けたいか？」で Good を選択
    await page.getByLabel("Good").click();

    // 送信 → 成功すると /mypage?success=report へ遷移する
    await page.getByRole("button", { name: "作業報告・評価を登録する" }).click();
    await page.waitForURL(/\/mypage/);
    expect(page.url()).toContain("success=report");
  });
});
