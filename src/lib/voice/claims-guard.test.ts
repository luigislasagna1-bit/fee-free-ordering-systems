/**
 * The claims guard (`services/nabil-voice/src/claims-guard.ts`): did the
 * sentence the caller just heard rest on evidence? Measurement only — each hit
 * is an event, never an interruption.
 */
import { describe, expect, it } from "vitest";
import { checkClaims, type ClaimHit } from "../../../services/nabil-voice/src/claims-guard";

const check = (spoken: string, over: Partial<Parameters<typeof checkClaims>[0]> = {}): ClaimHit[] =>
  checkClaims({ spoken, toolOutputs: [], toolNames: [], placedThisCall: false, speakExactly: [], ...over });

const kinds = (hits: ClaimHit[]) => hits.map((h) => h.kind);

describe("unavailability", () => {
  it("flags 'we don't have X' spoken with no tool evidence at all", () => {
    const hits = check("Sorry, we don't have red onion. Anything else?");
    expect(kinds(hits)).toEqual(["unavailability"]);
    expect(hits[0].sentence).toBe("Sorry, we don't have red onion.");
    expect(hits[0].evidence).toEqual([]);
    for (const s of ["That's not available today.", "We're out of wings.", "That's not an option here.", "It's not on the menu.", "We can't do half and half.", "Lasagna is sold out."]) {
      expect(kinds(check(s))).toEqual(["unavailability"]);
    }
  });

  it("is grounded when get_item_options / find_menu_item ran, when the evidence says so, or when the menu facts say so", () => {
    expect(check("Sorry, we don't have red onion.", { toolNames: ["get_item_options"], toolOutputs: [{ groups: [] }] })).toEqual([]);
    expect(check("Sorry, we don't have that.", { toolNames: ["find_menu_item"], toolOutputs: [{ candidates: [] }] })).toEqual([]);
    expect(check("We don't have that one.", { toolNames: ["add_to_order"], toolOutputs: [{ ok: false, code: "unknown_item" }] })).toEqual([]);
    expect(check("We don't have that one.", { toolNames: ["add_to_order"], toolOutputs: [{ ok: true, groups: [{ truncated: 20 }] }] })).toEqual([]);
    expect(check("Lasagna is sold out today.", { menuFacts: { soldOut: ["Lasagna"], notToday: [] } })).toEqual([]);
    expect(check("The Thursday Smash Burger isn't available today.", { menuFacts: { soldOut: [], notToday: ["Thursday Smash Burger"] } })).toEqual([]);
    // an unrelated tool is not evidence
    expect(kinds(check("We don't have red onion.", { toolNames: ["set_fulfilment"], toolOutputs: [{ ok: true, fulfilment: "pickup" }] }))).toEqual(["unavailability"]);
  });

  it("does not fire on ordinary sentences", () => {
    expect(check("Sure — a large pepperoni. Anything else?")).toEqual([]);
    expect(check("")).toEqual([]);
    expect(check("   ")).toEqual([]);
  });
});

describe("unsourced price", () => {
  it("is flagged only when a tool ran this turn and no tool produced that number", () => {
    // no tool ran ⇒ nothing to check against, no hit
    expect(check("That comes to $12.50.")).toEqual([]);
    // a tool ran and the total it produced is not what was said
    const hits = check("That comes to $12.50.", { toolNames: ["quote_order"], toolOutputs: [{ ok: true, total: 24.5 }] });
    expect(kinds(hits)).toEqual(["unsourced_price"]);
    expect(hits[0].evidence).toContain("12.50");
    // the quoted number, in any of its spoken forms, is sourced
    expect(check("Your total is $24.50 including tax.", { toolNames: ["quote_order"], toolOutputs: [{ ok: true, total: 24.5 }] })).toEqual([]);
    expect(check("That's 24 dollars and change — 24.5 exactly.", { toolNames: ["quote_order"], toolOutputs: [{ ok: true, total: 24.5 }] })).toEqual([]);
    expect(check("An extra 2 dollars for the cheese.", { toolNames: ["add_to_order"], toolOutputs: [{ ok: true, pricingNote: "Extra Cheese adds 2.00" }] })).toEqual([]);
    expect(check("The delivery fee is $7.99.", { toolNames: ["set_fulfilment"], toolOutputs: [{ ok: true, deliveryFee: 7.99 }] })).toEqual([]);
    // "$0" is ignored
    expect(check("That's $0 extra.", { toolNames: ["add_to_order"], toolOutputs: [{}] })).toEqual([]);
  });

  it("checks each price in a sentence", () => {
    const hits = check("That's $5.00 for the dip and $9.99 for the wings.", { toolNames: ["get_item_options"], toolOutputs: [{ sizes: [{ price: 9.99 }] }] });
    expect(kinds(hits)).toEqual(["unsourced_price"]);
    expect(hits[0].evidence).toContain("5.00");
  });
});

describe("false confirmation", () => {
  it("flags 'your order is placed' when nothing has been placed this call, and not once something has", () => {
    for (const s of ["Your order is placed!", "Great, your order has been confirmed.", "I've placed your order.", "You're all set.", "Your order number is 1234."]) {
      expect(kinds(check(s))).toEqual(["false_confirmation"]);
      expect(check(s, { placedThisCall: true })).toEqual([]);
    }
    expect(check("Let me place that for you now.")).toEqual([]);
  });
});

describe("read-back drift", () => {
  it("flags a speakExactly item name that was not spoken as written (Large 1 Topping read back as extra large)", () => {
    const hits = check("One extra large one topping with pepperoni — anything else?", { speakExactly: ["1× Large 1 Topping — Pepperoni"] });
    expect(kinds(hits)).toEqual(["readback_drift"]);
    expect(hits[0].evidence).toEqual(["Large 1 Topping"]);
    expect(hits[0].sentence).toContain("One extra large");
  });

  it("is satisfied when the names are spoken as written (case-insensitively), and skips very short names", () => {
    expect(check("One large 1 topping with pepperoni. Anything else?", { speakExactly: ["1× Large 1 Topping — Pepperoni"] })).toEqual([]);
    expect(check("So that's a Coke and a Garlic Dip.", { speakExactly: ["1× Coke", "1× Garlic Dip"] })).toEqual([]);
    // "Tea" is under 4 characters — never checked
    expect(check("One iced tea, sure.", { speakExactly: ["1× Tea"] })).toEqual([]);
    // only one drift hit per speakExactly string, even if several names differ
    const hits = check("One large order then.", { speakExactly: ["1× Large 1 Topping — Pepperoni, Mushroom"] });
    expect(kinds(hits)).toEqual(["readback_drift"]);
  });

  it("does NOT flag when the model simply omits the name (omission ≠ drift)", () => {
    expect(check("Got it, plain cheese it is. Is there anything else you'd like to add?", { speakExactly: ["1× Chicken Wings (Hot)"] })).toEqual([]);
    expect(check("Sure thing.", { speakExactly: ["1× Large 1 Topping — Pepperoni"] })).toEqual([]);
    expect(check("Two things then.", { speakExactly: ["1× Large 1 Topping — Pepperoni, Mushroom"] })).toEqual([]);
  });

  it("flags a near-miss where a word matches but the full name doesn't", () => {
    const hits = check("I've added your Philly Cheese for you.", { speakExactly: ["1× Philly Steak (Large)"] });
    expect(kinds(hits)).toEqual(["readback_drift"]);
    expect(hits[0].evidence).toEqual(["Philly Steak"]);
  });
});

describe("read-back drift tolerates the spoken layer's shortened recipe names", () => {
  it("'half Philly Steak' satisfies a speakExactly that says 'Philly Steak Pizza' (2026-08-16 false flag)", () => {
    expect(
      check("Perfect — that's a Large and Wings Combo with a large pizza, half Philly Steak, half Deluxe, ranch base on the Philly Steak half. What else?", {
        speakExactly: ["a Large and Wings Combo with a large pizza, half Philly Steak Pizza, half Deluxe Pizza, ranch base on the philly steak pizza half"],
      }),
    ).toEqual([]);
  });
});
