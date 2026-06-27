import { describe, it, expect } from "vitest";
import { partitionMemberOnly, promosForGroups } from "@/lib/vip-membership";

describe("vip-membership — partitionMemberOnly", () => {
  it("splits promos linked to a group from the public pool", () => {
    const promos = [
      { id: "a", groupLinks: [] },
      { id: "b", groupLinks: [{ groupId: "g1" }] },
      { id: "c" }, // no groupLinks field → public
      { id: "d", groupLinks: [{ groupId: "g1" }, { groupId: "g2" }] },
    ];
    const { general, memberOnly } = partitionMemberOnly(promos);
    expect(general.map((p) => p.id)).toEqual(["a", "c"]);
    expect(memberOnly.map((p) => p.id)).toEqual(["b", "d"]);
  });
});

describe("vip-membership — promosForGroups", () => {
  const memberOnly = [
    { id: "b", groupLinks: [{ groupId: "g1" }] },
    { id: "d", groupLinks: [{ groupId: "g2" }, { groupId: "g3" }] },
  ];

  it("returns only specials whose group the identity belongs to", () => {
    expect(promosForGroups(memberOnly, new Set(["g1"])).map((p) => p.id)).toEqual(["b"]);
    expect(promosForGroups(memberOnly, new Set(["g3"])).map((p) => p.id)).toEqual(["d"]);
    expect(promosForGroups(memberOnly, new Set(["g1", "g2"])).map((p) => p.id)).toEqual(["b", "d"]);
  });

  it("returns nothing when the identity is in no relevant group", () => {
    expect(promosForGroups(memberOnly, new Set(["gX"]))).toEqual([]);
    expect(promosForGroups(memberOnly, new Set())).toEqual([]);
  });
});
