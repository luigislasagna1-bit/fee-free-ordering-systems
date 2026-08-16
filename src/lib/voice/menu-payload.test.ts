import { describe, expect, it, vi } from "vitest";

// The pure helper under test never touches the DB, but the module also exports
// the Prisma-backed builder — stub the client so importing it needs no
// DATABASE_URL (same pattern as dispute-handler.test.ts).
vi.mock("@/lib/db", () => ({ default: {} }));

import {
  serializeChoiceNames,
  visibleMenuTree,
  VOICE_MENU_MAX_CHOICE_GROUPS,
  VOICE_MENU_MAX_OPTION_NAMES,
} from "@/lib/voice/menu-payload";

/**
 * VISIBILITY (Roya's call, 2026-08-16): a row the owner had HIDDEN from the
 * customer menu (visibilityMode "hide_from_menu" — an un-dated copy of the
 * Monday special) reached the prompt because the payload filtered on
 * `isAvailable` alone, and Nabil offered it as "today's deal" on a Sunday.
 * The phone menu must apply the same visibility rules as the website.
 */
describe("visibleMenuTree — hidden categories/items never reach the prompt", () => {
  const TZ = "America/Toronto";
  const now = new Date("2026-08-16T15:40:00Z"); // Sunday 11:40 EDT
  const item = (name: string, extra: Record<string, unknown> = {}) => ({ name, isHidden: false, visibilityMode: null, ...extra });

  it("drops an item hidden with hide_from_menu (legacy isHidden too), keeps the rest in order", () => {
    const tree = visibleMenuTree(
      [
        {
          name: "Daily Deals",
          isHidden: false,
          visibilityMode: null,
          menuItems: [
            item("Monday - Medium Pizza Special"),
            item("Medium Pizza 1 Topping", { isHidden: true, visibilityMode: "hide_from_menu" }),
            item("Legacy hidden", { isHidden: true }),
            item("Tuesday - Large Pizza Special"),
          ],
        },
      ],
      now,
      TZ,
    );
    expect(tree[0].menuItems.map((i) => i.name)).toEqual(["Monday - Medium Pizza Special", "Tuesday - Large Pizza Special"]);
  });

  it("drops a whole hidden category", () => {
    const tree = visibleMenuTree(
      [
        { name: "Visible", isHidden: false, visibilityMode: null, menuItems: [item("A")] },
        { name: "Hidden", isHidden: true, visibilityMode: "hide_from_menu", menuItems: [item("B")] },
      ],
      now,
      TZ,
    );
    expect(tree.map((c) => c.name)).toEqual(["Visible"]);
  });

  it("honours a scheduled show_only_from window in the restaurant timezone (Sunday 11:40 EDT)", () => {
    const tree = visibleMenuTree(
      [
        {
          name: "Cat",
          isHidden: false,
          visibilityMode: null,
          menuItems: [
            item("Sunday brunch", { visibilityMode: "show_only_from", visibleDays: "[0]", visibleFrom: "10:00", visibleTo: "14:00" }),
            item("Weekday lunch", { visibilityMode: "show_only_from", visibleDays: "[1,2,3,4,5]", visibleFrom: "11:00", visibleTo: "14:00" }),
          ],
        },
      ],
      now,
      TZ,
    );
    expect(tree[0].menuItems.map((i) => i.name)).toEqual(["Sunday brunch"]);
  });

  it("does not mutate its input", () => {
    const input = [{ name: "Cat", isHidden: false, visibilityMode: null, menuItems: [item("A"), item("B", { isHidden: true })] }];
    const snapshot = JSON.stringify(input);
    visibleMenuTree(input, now, TZ);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

/**
 * TRUNCATION MARKERS on the names-only choice view (2026-08-15).
 *
 * The `get_menu` payload lists a pizza's toppings BY NAME, capped at 12 per
 * group and 4 groups per item, so a 100-topping store can't blow the prompt
 * budget back up. On 2026-08-15 the model read those 12 as THE topping list
 * and told a caller red onion didn't exist — the store had 30 toppings and
 * red onion was #20. A capped list must SAY it is capped: `andMore: <n>` on a
 * capped group, `choiceGroupsOmitted: <n>` on the item when groups were
 * dropped. These lock that contract on the pure helper.
 */

const opts = (n: number, prefix = "Opt") =>
  Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${i + 1}` }));

describe("serializeChoiceNames — per-group cap", () => {
  it("leaves a group under the cap untouched, with no andMore key at all", () => {
    const out = serializeChoiceNames([{ name: "Crust", options: opts(3, "Crust") }]);
    expect(out).toEqual({ choiceNames: [{ name: "Crust", options: ["Crust 1", "Crust 2", "Crust 3"] }] });
    expect(out!.choiceNames[0]).not.toHaveProperty("andMore");
  });

  it("a group EXACTLY at the cap is not marked (nothing was omitted)", () => {
    const out = serializeChoiceNames([{ name: "Sauces", options: opts(VOICE_MENU_MAX_OPTION_NAMES) }]);
    expect(out!.choiceNames[0].options).toHaveLength(VOICE_MENU_MAX_OPTION_NAMES);
    expect(out!.choiceNames[0]).not.toHaveProperty("andMore");
  });

  it("a group over the cap keeps the first N names IN ORDER and carries andMore = omitted count", () => {
    const out = serializeChoiceNames([{ name: "Toppings", options: opts(15, "T") }]);
    const g = out!.choiceNames[0];
    expect(g.options).toHaveLength(VOICE_MENU_MAX_OPTION_NAMES);
    expect(g.options[0]).toBe("T 1");
    expect(g.options[VOICE_MENU_MAX_OPTION_NAMES - 1]).toBe(`T ${VOICE_MENU_MAX_OPTION_NAMES}`);
    expect(g.andMore).toBe(15 - VOICE_MENU_MAX_OPTION_NAMES);
  });

  it("REGRESSION 2026-08-15: red onion at #20 of 30 is off the list, but the list says 18 more exist", () => {
    const toppings = opts(30, "Topping").map((o, i) => (i === 19 ? { name: "Red Onion" } : o));
    const out = serializeChoiceNames([{ name: "Toppings", options: toppings }]);
    const g = out!.choiceNames[0];
    expect(g.options).not.toContain("Red Onion"); // it IS cut — that's the budget
    expect(g.andMore).toBe(18); // …and the model is TOLD it's cut, so it must look it up
  });

  it("caps each group independently", () => {
    const out = serializeChoiceNames([
      { name: "Crust", options: opts(2) },
      { name: "Toppings", options: opts(40) },
    ]);
    expect(out!.choiceNames[0]).toEqual({ name: "Crust", options: ["Opt 1", "Opt 2"] });
    expect(out!.choiceNames[1].andMore).toBe(40 - VOICE_MENU_MAX_OPTION_NAMES);
  });
});

describe("serializeChoiceNames — group-list cap", () => {
  it("drops empty groups (they answer nothing) and does NOT count them as omitted", () => {
    const out = serializeChoiceNames([
      { name: "Empty A", options: [] },
      { name: "Crust", options: opts(2) },
      { name: "Empty B", options: null },
      { name: "No options key" },
    ]);
    expect(out).toEqual({ choiceNames: [{ name: "Crust", options: ["Opt 1", "Opt 2"] }] });
    expect(out).not.toHaveProperty("choiceGroupsOmitted");
  });

  it("returns null when nothing survives, so the item keeps its historical no-choiceNames shape", () => {
    expect(serializeChoiceNames([])).toBeNull();
    expect(serializeChoiceNames([{ name: "Empty", options: [] }])).toBeNull();
  });

  it("EXACTLY the max number of non-empty groups is not marked", () => {
    const groups = Array.from({ length: VOICE_MENU_MAX_CHOICE_GROUPS }, (_, i) => ({ name: `G${i}`, options: opts(1) }));
    const out = serializeChoiceNames(groups);
    expect(out!.choiceNames).toHaveLength(VOICE_MENU_MAX_CHOICE_GROUPS);
    expect(out).not.toHaveProperty("choiceGroupsOmitted");
  });

  it("more non-empty groups than the cap ⇒ first N kept in order + choiceGroupsOmitted = dropped count", () => {
    const groups = Array.from({ length: VOICE_MENU_MAX_CHOICE_GROUPS + 3 }, (_, i) => ({ name: `G${i}`, options: opts(1) }));
    const out = serializeChoiceNames(groups);
    expect(out!.choiceNames.map((g) => g.name)).toEqual(
      Array.from({ length: VOICE_MENU_MAX_CHOICE_GROUPS }, (_, i) => `G${i}`),
    );
    expect(out!.choiceGroupsOmitted).toBe(3);
  });

  it("empty groups interleaved with real ones don't eat into the group budget", () => {
    // 4 real groups + 3 empty ones: all 4 real survive, nothing is "omitted".
    const groups = [
      { name: "R1", options: opts(1) },
      { name: "E1", options: [] },
      { name: "R2", options: opts(1) },
      { name: "E2", options: [] },
      { name: "R3", options: opts(1) },
      { name: "E3", options: [] },
      { name: "R4", options: opts(1) },
    ];
    const out = serializeChoiceNames(groups);
    expect(out!.choiceNames.map((g) => g.name)).toEqual(["R1", "R2", "R3", "R4"]);
    expect(out).not.toHaveProperty("choiceGroupsOmitted");
  });

  it("both caps at once: a capped group inside a capped list carries both markers", () => {
    const groups = [
      { name: "Toppings", options: opts(20) },
      ...Array.from({ length: VOICE_MENU_MAX_CHOICE_GROUPS }, (_, i) => ({ name: `G${i}`, options: opts(1) })),
    ];
    const out = serializeChoiceNames(groups)!;
    expect(out.choiceNames[0].andMore).toBe(20 - VOICE_MENU_MAX_OPTION_NAMES);
    expect(out.choiceGroupsOmitted).toBe(1);
  });

  it("does not mutate its input", () => {
    const groups = [{ name: "Toppings", options: opts(20) }];
    const before = JSON.stringify(groups);
    serializeChoiceNames(groups);
    expect(JSON.stringify(groups)).toBe(before);
  });
});

describe("caps", () => {
  it("are the documented budget (12 names / 4 groups) — change deliberately, with the prompt cost in mind", () => {
    expect(VOICE_MENU_MAX_OPTION_NAMES).toBe(12);
    expect(VOICE_MENU_MAX_CHOICE_GROUPS).toBe(4);
  });
});
