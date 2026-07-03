import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { viesCountryCode, isEuViesCountry, checkViesVat, euVatSubscriptionBlock, parseViesVatNumber } from "./vies";

// In-memory db for euVatSubscriptionBlock (dynamic import inside the lib).
const { db } = vi.hoisted(() => ({
  db: {
    restaurantBillingProfile: { findUnique: vi.fn() },
    restaurant: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ default: db }));

describe("viesCountryCode / isEuViesCountry", () => {
  it("maps Greece ISO GR to VIES EL", () => {
    expect(viesCountryCode("GR")).toBe("EL");
    expect(viesCountryCode("gr")).toBe("EL");
  });
  it("accepts EU members + Northern Ireland, case/whitespace-insensitively", () => {
    expect(viesCountryCode("IT")).toBe("IT");
    expect(viesCountryCode(" de ")).toBe("DE");
    expect(viesCountryCode("XI")).toBe("XI");
  });
  it("rejects non-EU countries and empty input", () => {
    expect(viesCountryCode("CA")).toBeNull();
    expect(viesCountryCode("GB")).toBeNull(); // post-Brexit: only XI, not GB
    expect(viesCountryCode("US")).toBeNull();
    expect(viesCountryCode("")).toBeNull();
    expect(viesCountryCode(null)).toBeNull();
    expect(viesCountryCode(undefined)).toBeNull();
    expect(isEuViesCountry("CA")).toBe(false);
    expect(isEuViesCountry("FR")).toBe(true);
  });
});

describe("parseViesVatNumber (self-prefixed reseller VAT numbers)", () => {
  it("splits an EU-prefixed number into member state + bare number", () => {
    expect(parseViesVatNumber("IT01234567890")).toEqual({ ms: "IT", number: "01234567890" });
    expect(parseViesVatNumber("it 0123.456-7890")).toEqual({ ms: "IT", number: "01234567890" });
  });
  it("accepts both GR and EL prefixes for Greece, always emitting EL", () => {
    expect(parseViesVatNumber("EL123456789")).toEqual({ ms: "EL", number: "123456789" });
    expect(parseViesVatNumber("GR123456789")).toEqual({ ms: "EL", number: "123456789" });
  });
  it("returns null for non-EU or unprefixed numbers (can't check ≠ invalid)", () => {
    expect(parseViesVatNumber("809409832RT0001")).toBeNull(); // Canadian GST/HST
    expect(parseViesVatNumber("GB123456789")).toBeNull(); // post-Brexit
    expect(parseViesVatNumber("US12-3456789")).toBeNull();
    expect(parseViesVatNumber("")).toBeNull();
    expect(parseViesVatNumber(null)).toBeNull();
    expect(parseViesVatNumber("IT")).toBeNull(); // prefix only, no number
  });
});

describe("checkViesVat", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const ok = (body: unknown) =>
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => body });

  it("returns not_eu without calling VIES for a non-EU country", async () => {
    const res = await checkViesVat("CA", "809409832RT0001");
    expect(res).toEqual({ checked: false, reason: "not_eu" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("strips the country prefix + spaces/dots and calls the VIES REST endpoint", async () => {
    ok({ isValid: true, name: "ACME SRL", address: "VIA ROMA 1" });
    const res = await checkViesVat("IT", "IT 03982.530-135");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://ec.europa.eu/taxation_customs/vies/rest-api/ms/IT/vat/03982530135",
    );
    expect(res).toEqual({ checked: true, valid: true, name: "ACME SRL", address: "VIA ROMA 1" });
  });

  it("uses EL in the URL for a Greek ISO country + Greek-prefixed number", async () => {
    ok({ isValid: true });
    await checkViesVat("GR", "EL123456789");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ms/EL/vat/123456789");
  });

  it("reports an unregistered number as checked+invalid (Fabrizio's JUBIN case)", async () => {
    ok({ isValid: false });
    const res = await checkViesVat("IT", "12345678901");
    expect(res).toMatchObject({ checked: true, valid: false });
  });

  it("treats an obviously malformed number as invalid without calling VIES", async () => {
    const res = await checkViesVat("IT", "!!");
    expect(res).toMatchObject({ checked: true, valid: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails SOFT on VIES self-reported downtime (userError=MS_UNAVAILABLE)", async () => {
    ok({ userError: "MS_UNAVAILABLE" });
    const res = await checkViesVat("DE", "DE123456789");
    expect(res).toEqual({ checked: false, reason: "MS_UNAVAILABLE" });
  });

  it("fails SOFT on HTTP errors and network failures — never throws", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await checkViesVat("FR", "FR12345678901")).toEqual({
      checked: false,
      reason: "vies_http_500",
    });
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    expect(await checkViesVat("FR", "FR12345678901")).toEqual({
      checked: false,
      reason: "TimeoutError",
    });
  });

  it("fails SOFT on a malformed VIES payload (no isValid boolean)", async () => {
    ok({ something: "else" });
    expect(await checkViesVat("ES", "ESB12345678")).toEqual({
      checked: false,
      reason: "vies_bad_response",
    });
  });
});

describe("euVatSubscriptionBlock (Option A purchase gate)", () => {
  beforeEach(() => {
    db.restaurantBillingProfile.findUnique.mockReset();
    db.restaurant.findUnique.mockReset();
  });

  it("allows non-EU restaurants (Canada) regardless of VAT state", async () => {
    db.restaurantBillingProfile.findUnique.mockResolvedValue(null);
    db.restaurant.findUnique.mockResolvedValue({ country: "CA" });
    expect(await euVatSubscriptionBlock("r1")).toBeNull();
  });

  it("blocks an EU restaurant with no VAT number on file", async () => {
    db.restaurantBillingProfile.findUnique.mockResolvedValue({
      country: "IT", taxId: "", taxIdViesValid: null,
    });
    db.restaurant.findUnique.mockResolvedValue({ country: "IT" });
    expect(await euVatSubscriptionBlock("r1")).toEqual({ code: "eu_vat_required", country: "IT" });
  });

  it("blocks an EU restaurant whose number failed or hasn't passed VIES", async () => {
    db.restaurantBillingProfile.findUnique.mockResolvedValue({
      country: "IT", taxId: "IT12345678901", taxIdViesValid: false,
    });
    db.restaurant.findUnique.mockResolvedValue({ country: "IT" });
    expect(await euVatSubscriptionBlock("r1")).toMatchObject({ code: "eu_vat_required" });

    db.restaurantBillingProfile.findUnique.mockResolvedValue({
      country: "IT", taxId: "IT12345678901", taxIdViesValid: null, // e.g. VIES was down at save
    });
    expect(await euVatSubscriptionBlock("r1")).toMatchObject({ code: "eu_vat_required" });
  });

  it("allows an EU restaurant with a VIES-validated number", async () => {
    db.restaurantBillingProfile.findUnique.mockResolvedValue({
      country: "IT", taxId: "IT03982530135", taxIdViesValid: true,
    });
    db.restaurant.findUnique.mockResolvedValue({ country: "IT" });
    expect(await euVatSubscriptionBlock("r1")).toBeNull();
  });

  it("falls back to the restaurant's own country when no billing profile exists", async () => {
    db.restaurantBillingProfile.findUnique.mockResolvedValue(null);
    db.restaurant.findUnique.mockResolvedValue({ country: "DE" });
    expect(await euVatSubscriptionBlock("r1")).toEqual({ code: "eu_vat_required", country: "DE" });
  });
});
