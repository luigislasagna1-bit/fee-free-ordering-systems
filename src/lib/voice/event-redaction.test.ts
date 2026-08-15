/**
 * The event log is the most detailed record we keep of a phone call, so the
 * redaction chokepoint has to be right: phones keep the last 4, card-shaped
 * digit runs vanish, emails keep the domain, street numbers keep the first
 * digit, and the structural keys the timeline depends on are never touched.
 */
import { describe, it, expect } from "vitest";
import { redactEventPayload, redactString, redactAddressString } from "./event-redaction";

describe("redactString", () => {
  it("keeps only the last 4 digits of every phone shape we see", () => {
    expect(redactString("call me at +1 (416) 833-8405 please")).toBe("call me at ***-8405 please");
    expect(redactString("4168338405")).toBe("***-8405");
    expect(redactString("416.833.8405 or 647-669-0808")).toBe("***-8405 or ***-0808");
    expect(redactString("+14168338405")).toBe("***-8405");
  });

  it("masks 13–19 digit runs entirely (a card read aloud)", () => {
    expect(redactString("my card is 4242424242424242 exp 12/28")).toBe("my card is [redacted-number] exp 12/28");
    expect(redactString("1234567890123")).toBe("[redacted-number]");
  });

  it("keeps the email domain only", () => {
    expect(redactString("send it to luigi.slasagna+1@gmail.com thanks")).toBe("send it to ***@gmail.com thanks");
  });

  it("leaves ordinary text, prices, short numbers and dates alone", () => {
    const s = "Two large pepperoni pizzas, $25.97, order ORD-264127463 at 2026-08-15T12:00:00.000Z";
    expect(redactString(s)).toBe(s);
    expect(redactString("")).toBe("");
  });
});

describe("redactAddressString", () => {
  it("masks all but the first digit of the street number", () => {
    expect(redactAddressString("123 Main St")).toBe("1** Main St");
    expect(redactAddressString("  4567 Yonge Street, Toronto")).toBe("  4*** Yonge Street, Toronto");
    expect(redactAddressString("7 King St")).toBe("7 King St");
    expect(redactAddressString("Main St")).toBe("Main St");
  });
});

describe("redactEventPayload", () => {
  it("walks nested objects and arrays, redacting every string", () => {
    const ev = {
      type: "tool_result",
      name: "place_order",
      output: {
        ok: true,
        customer: { phone: "+14168338405", email: "a@b.com" },
        lines: [{ description: "1 × large pepperoni" }, { description: "text me at 416 833 8405" }],
      },
    };
    const r = redactEventPayload(ev);
    expect(r.output.customer.phone).toBe("***-8405");
    expect(r.output.customer.email).toBe("***@b.com");
    expect(r.output.lines[1].description).toBe("text me at ***-8405");
    expect(r.output.lines[0].description).toBe("1 × large pepperoni");
    // Never mutates the input.
    expect(ev.output.customer.phone).toBe("+14168338405");
  });

  it("applies the street-number rule to address-named keys at any depth", () => {
    const r = redactEventPayload({
      input: { street: "123 Main St", deliveryAddress: "88 Queen St W", address: "9 Bay St", city: "Toronto 123" },
      fulfilment: { type: "delivery", address: "4567 Yonge Street" },
    });
    expect(r.input.street).toBe("1** Main St");
    expect(r.input.deliveryAddress).toBe("8* Queen St W");
    expect(r.input.address).toBe("9 Bay St");
    expect(r.input.city).toBe("Toronto 123"); // not an address key
    expect(r.fulfilment.address).toBe("4*** Yonge Street");
  });

  it("never touches the structural / hash keys the timeline joins on", () => {
    const ev = {
      seq: 12,
      ts: "2026-08-15T12:00:00.000Z",
      type: "cart",
      turn: 3,
      hash: "4168338405abcdef", // looks phone-ish on purpose
      cartHashBefore: "4168338405000000",
      cartHashAfter: "1234567890123456",
      name: "add_line_4168338405",
      toolUseId: "toolu_4168338405",
      versions: { agentVersion: "4168338405", promptVersion: "p1" },
      hop: 1,
      lang: "en",
    };
    expect(redactEventPayload(ev)).toEqual(ev);
  });

  it("skips `name` only at the top level (tool name); a nested customer.name still goes through the rules", () => {
    const r = redactEventPayload({
      name: "set_customer_4168338405",
      input: { name: "Roya 4168338405", phone: "4168338405" },
    });
    expect(r.name).toBe("set_customer_4168338405");
    expect(r.input.name).toBe("Roya ***-8405");
    expect(r.input.phone).toBe("***-8405");
  });

  it("passes non-string primitives through untouched", () => {
    const ev = { ms: 4168338405, ok: true, code: null, ttfaMs: 1234567890123 };
    expect(redactEventPayload(ev)).toEqual(ev);
  });

  it("does not blow the stack on absurd nesting", () => {
    let deep: any = "4168338405";
    for (let i = 0; i < 100; i++) deep = { x: deep };
    expect(() => redactEventPayload(deep)).not.toThrow();
  });
});
