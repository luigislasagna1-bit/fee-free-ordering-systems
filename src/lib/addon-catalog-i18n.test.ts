import { describe, expect, it } from "vitest";
import {
  localizedAddOnName,
  localizedAddOnDescription,
  type AddOnCatalogTranslator,
} from "./addon-catalog-i18n";

/** Fake next-intl translator scoped to "addOnCatalog". */
function fakeT(map: Record<string, string>): AddOnCatalogTranslator {
  const fn = ((key: string) => {
    if (!(key in map)) throw new Error(`MISSING_MESSAGE: ${key}`);
    return map[key];
  }) as AddOnCatalogTranslator;
  fn.has = (key: string) => key in map;
  return fn;
}

describe("localizedAddOnName", () => {
  it("returns the translated name when the slug has keys", () => {
    const t = fakeT({ "online_payments.name": "Pagamenti online" });
    expect(localizedAddOnName(t, "online_payments", "Online Payments")).toBe("Pagamenti online");
  });

  it("falls back to the DB name for an unknown slug (never a key path, never throws)", () => {
    const t = fakeT({});
    expect(localizedAddOnName(t, "future_addon", "Future Add-On")).toBe("Future Add-On");
  });
});

describe("localizedAddOnDescription", () => {
  it("returns the translated description when the slug has keys", () => {
    const t = fakeT({ "online_payments.description": "Accetta pagamenti con carta online." });
    expect(localizedAddOnDescription(t, "online_payments", "Accept card payments online.")).toBe(
      "Accetta pagamenti con carta online.",
    );
  });

  it("falls back to the DB description for an unknown slug", () => {
    const t = fakeT({});
    expect(localizedAddOnDescription(t, "future_addon", "English copy")).toBe("English copy");
  });

  it("passes through a null DB description for an unknown slug", () => {
    const t = fakeT({});
    expect(localizedAddOnDescription(t, "future_addon", null)).toBeNull();
  });
});
