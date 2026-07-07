import { describe, expect, it } from "vitest";

import {
  actorIdentityKey,
  areIdentityPairsEqual,
  isSameActorIdentity,
  type ThreadActorIdentity,
} from "@/lib/messaging/identity";

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USER_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ORG_X = "11111111-1111-1111-1111-111111111111";
const ORG_Y = "22222222-2222-2222-2222-222222222222";

describe("actorIdentityKey", () => {
  it("組織所属者は organizationId を identity として返す", () => {
    const actor: ThreadActorIdentity = { userId: USER_A, organizationId: ORG_X };
    expect(actorIdentityKey(actor)).toBe(ORG_X);
  });

  it("個人ユーザーは userId を identity として返す", () => {
    const actor: ThreadActorIdentity = { userId: USER_A, organizationId: null };
    expect(actorIdentityKey(actor)).toBe(USER_A);
  });
});

describe("isSameActorIdentity", () => {
  it("同じ組織所属の複数ユーザーは同一 identity と判定される (組織代表)", () => {
    const staff1: ThreadActorIdentity = { userId: USER_A, organizationId: ORG_X };
    const staff2: ThreadActorIdentity = { userId: USER_B, organizationId: ORG_X };
    expect(isSameActorIdentity(staff1, staff2)).toBe(true);
  });

  it("異なる組織所属は別 identity", () => {
    const staff1: ThreadActorIdentity = { userId: USER_A, organizationId: ORG_X };
    const staff2: ThreadActorIdentity = { userId: USER_A, organizationId: ORG_Y };
    expect(isSameActorIdentity(staff1, staff2)).toBe(false);
  });

  it("個人ユーザー同士 (同 userId) は同一", () => {
    const individual1: ThreadActorIdentity = { userId: USER_A, organizationId: null };
    const individual2: ThreadActorIdentity = { userId: USER_A, organizationId: null };
    expect(isSameActorIdentity(individual1, individual2)).toBe(true);
  });

  it("個人ユーザー同士 (別 userId) は別", () => {
    const individual1: ThreadActorIdentity = { userId: USER_A, organizationId: null };
    const individual2: ThreadActorIdentity = { userId: USER_B, organizationId: null };
    expect(isSameActorIdentity(individual1, individual2)).toBe(false);
  });

  it("個人ユーザーと組織所属 (同 userId でも異なる場合) は別", () => {
    // 同じ userId でも「今は個人として振る舞う」vs「組織として振る舞う」は別 identity
    const individual: ThreadActorIdentity = { userId: USER_A, organizationId: null };
    const asMember: ThreadActorIdentity = { userId: USER_A, organizationId: ORG_X };
    expect(isSameActorIdentity(individual, asMember)).toBe(false);
  });
});

describe("areIdentityPairsEqual", () => {
  const p2p_AB: readonly [ThreadActorIdentity, ThreadActorIdentity] = [
    { userId: USER_A, organizationId: null },
    { userId: USER_B, organizationId: null },
  ];

  it("同じペアを同じ順序で渡すと true", () => {
    const same: readonly [ThreadActorIdentity, ThreadActorIdentity] = [
      { userId: USER_A, organizationId: null },
      { userId: USER_B, organizationId: null },
    ];
    expect(areIdentityPairsEqual(p2p_AB, same)).toBe(true);
  });

  it("同じペアを逆順で渡しても true (順序無関係)", () => {
    const reversed: readonly [ThreadActorIdentity, ThreadActorIdentity] = [
      { userId: USER_B, organizationId: null },
      { userId: USER_A, organizationId: null },
    ];
    expect(areIdentityPairsEqual(p2p_AB, reversed)).toBe(true);
  });

  it("片方が違えば false", () => {
    const different: readonly [ThreadActorIdentity, ThreadActorIdentity] = [
      { userId: USER_A, organizationId: null },
      { userId: USER_C, organizationId: null },
    ];
    expect(areIdentityPairsEqual(p2p_AB, different)).toBe(false);
  });

  it("組織⇔個人ペアの順序無関係比較", () => {
    const orgIndiv: readonly [ThreadActorIdentity, ThreadActorIdentity] = [
      { userId: USER_A, organizationId: ORG_X },
      { userId: USER_B, organizationId: null },
    ];
    const reversed: readonly [ThreadActorIdentity, ThreadActorIdentity] = [
      { userId: USER_B, organizationId: null },
      { userId: USER_A, organizationId: ORG_X },
    ];
    expect(areIdentityPairsEqual(orgIndiv, reversed)).toBe(true);
  });

  it("組織⇔組織ペアも順序無関係比較で成立する (Phase 2 で新規サポート)", () => {
    const org1org2: readonly [ThreadActorIdentity, ThreadActorIdentity] = [
      { userId: USER_A, organizationId: ORG_X },
      { userId: USER_B, organizationId: ORG_Y },
    ];
    const reversed: readonly [ThreadActorIdentity, ThreadActorIdentity] = [
      { userId: USER_B, organizationId: ORG_Y },
      { userId: USER_A, organizationId: ORG_X },
    ];
    expect(areIdentityPairsEqual(org1org2, reversed)).toBe(true);
  });
});
