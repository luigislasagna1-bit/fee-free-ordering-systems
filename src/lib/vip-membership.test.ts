import { describe, it, expect } from "vitest";
import { partitionMemberOnly, promosForIdentity, type ResolvedIdentity } from "@/lib/vip-membership";

const empty: ResolvedIdentity = { groupIds: new Set(), customerIds: new Set(), email: null, phone: null };

describe("vip-membership — partitionMemberOnly", () => {
  it("splits promos linked to a target from the public pool", () => {
    const promos = [
      { id: "a", groupLinks: [] },
      { id: "b", groupLinks: [{ groupId: "g1" }] },
      { id: "c" }, // no groupLinks field → public
      { id: "d", groupLinks: [{ customerId: "cust1" }] },
    ];
    const { general, memberOnly } = partitionMemberOnly(promos);
    expect(general.map((p) => p.id)).toEqual(["a", "c"]);
    expect(memberOnly.map((p) => p.id)).toEqual(["b", "d"]);
  });
});

describe("vip-membership — promosForIdentity (group + individual targets)", () => {
  const memberOnly = [
    { id: "grp", groupLinks: [{ groupId: "g1" }] },
    { id: "acct", groupLinks: [{ customerId: "cust1", email: "a@x.com" }] },
    { id: "mail", groupLinks: [{ email: "guest@x.com" }] },
    { id: "phone", groupLinks: [{ phone: "+15551234" }] },
  ];

  it("matches a group member", () => {
    const r = { ...empty, groupIds: new Set(["g1"]) };
    expect(promosForIdentity(memberOnly, r).map((p) => p.id)).toEqual(["grp"]);
  });

  it("matches an individual by account id", () => {
    const r = { ...empty, customerIds: new Set(["cust1"]) };
    expect(promosForIdentity(memberOnly, r).map((p) => p.id)).toEqual(["acct"]);
  });

  it("matches an individual by typed email (case-insensitive)", () => {
    const r = { ...empty, email: "guest@x.com" };
    expect(promosForIdentity(memberOnly, r).map((p) => p.id)).toEqual(["mail"]);
  });

  it("does NOT match by phone alone (strict — email/sign-in only)", () => {
    const r = { ...empty, phone: "+15551234" };
    expect(promosForIdentity(memberOnly, r)).toEqual([]);
  });

  it("returns nothing for an unrelated identity", () => {
    const r = { ...empty, groupIds: new Set(["gX"]), email: "nobody@x.com" };
    expect(promosForIdentity(memberOnly, r)).toEqual([]);
  });
});
