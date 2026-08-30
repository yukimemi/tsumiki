import { describe, it, expect } from "vitest";
import { MEMBER_COLORS, type Household, type MemberInfo } from "../types";
import {
  ROLE_LABELS_JA,
  canApprove,
  canManageMembers,
  canManageTasks,
  displayNameOf,
  freeMemberColor,
  isOwner,
  isParent,
  memberOf,
  roleOf,
} from "./roles";

const household: Household = {
  id: "h1",
  name: "やまだけ",
  ownerId: "owner-uid",
  memberIds: ["owner-uid", "parent-uid", "child-uid"],
  memberRoles: {
    "owner-uid": "owner",
    "parent-uid": "parent",
    "child-uid": "child",
  },
  memberInfo: {
    "owner-uid": { displayName: "おかあさん", color: "sakura", emoji: "🌸" },
    "parent-uid": { displayName: "おとうさん", color: "sora", emoji: "🐳" },
    "child-uid": { displayName: "はな", color: "wakaba", emoji: "🐰" },
  },
  coinYen: 10,
};

describe("roleOf", () => {
  it("reads the role of a member", () => {
    expect(roleOf(household, "owner-uid")).toBe("owner");
    expect(roleOf(household, "parent-uid")).toBe("parent");
    expect(roleOf(household, "child-uid")).toBe("child");
  });

  it("returns null without a household or a uid", () => {
    expect(roleOf(null, "owner-uid")).toBeNull();
    expect(roleOf(household, null)).toBeNull();
    expect(roleOf(null, null)).toBeNull();
  });

  it("returns null for a uid that is not a member", () => {
    expect(roleOf(household, "stranger-uid")).toBeNull();
  });
});

describe("isOwner / isParent", () => {
  it("recognises the owner", () => {
    expect(isOwner(household, "owner-uid")).toBe(true);
    expect(isOwner(household, "parent-uid")).toBe(false);
    expect(isOwner(household, "child-uid")).toBe(false);
    expect(isOwner(household, "stranger-uid")).toBe(false);
    expect(isOwner(null, "owner-uid")).toBe(false);
  });

  it("treats the owner as a parent too", () => {
    expect(isParent(household, "owner-uid")).toBe(true);
    expect(isParent(household, "parent-uid")).toBe(true);
  });

  it("does not treat a child or a stranger as a parent", () => {
    expect(isParent(household, "child-uid")).toBe(false);
    expect(isParent(household, "stranger-uid")).toBe(false);
    expect(isParent(null, "child-uid")).toBe(false);
  });
});

describe("capabilities", () => {
  const capabilities = [canManageTasks, canApprove, canManageMembers];

  it("grants every parent capability to the owner and to a parent", () => {
    for (const can of capabilities) {
      expect(can(household, "owner-uid")).toBe(true);
      expect(can(household, "parent-uid")).toBe(true);
    }
  });

  it("denies every parent capability to a child", () => {
    for (const can of capabilities) {
      expect(can(household, "child-uid")).toBe(false);
    }
  });

  it("denies every parent capability to a stranger and with no household", () => {
    for (const can of capabilities) {
      expect(can(household, "stranger-uid")).toBe(false);
      expect(can(null, "owner-uid")).toBe(false);
      expect(can(household, null)).toBe(false);
    }
  });
});

describe("memberOf / displayNameOf", () => {
  it("returns the stored member info", () => {
    expect(memberOf(household, "child-uid")?.emoji).toBe("🐰");
    expect(displayNameOf(household, "child-uid")).toBe("はな");
  });

  it("falls back for an unknown uid instead of rendering undefined", () => {
    expect(memberOf(household, "stranger-uid")).toBeNull();
    expect(memberOf(null, "child-uid")).toBeNull();
    expect(displayNameOf(household, "stranger-uid")).toBe("だれか");
    expect(displayNameOf(null, "child-uid")).toBe("だれか");
  });
});

describe("ROLE_LABELS_JA", () => {
  it("labels every role in Japanese", () => {
    expect(ROLE_LABELS_JA.owner).toBe("おや(かんりにん)");
    expect(ROLE_LABELS_JA.parent).toBe("おや");
    expect(ROLE_LABELS_JA.child).toBe("こども");
  });
});

describe("freeMemberColor", () => {
  it("picks the first colour nobody in the household is using", () => {
    const memberInfo: Record<string, MemberInfo> = {
      a: { displayName: "a", color: "sakura", emoji: "🐰" },
      b: { displayName: "b", color: "sora", emoji: "🐻" },
    };
    expect(freeMemberColor(memberInfo)).toBe("wakaba");
  });

  it("returns the first colour when nobody has one yet", () => {
    expect(freeMemberColor(undefined)).toBe(MEMBER_COLORS[0]);
    expect(freeMemberColor({})).toBe(MEMBER_COLORS[0]);
  });

  it("wraps back to the first colour once every slot is taken", () => {
    const memberInfo: Record<string, MemberInfo> = Object.fromEntries(
      MEMBER_COLORS.map((color, index) => [
        `member-${index}`,
        { displayName: `member-${index}`, color, emoji: "🐰" },
      ]),
    );
    expect(freeMemberColor(memberInfo)).toBe(MEMBER_COLORS[0]);
  });
});
