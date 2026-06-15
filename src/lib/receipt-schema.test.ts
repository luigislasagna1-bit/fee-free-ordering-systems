import { describe, it, expect } from "vitest";
import { parseReceiptConfig, DEFAULT_CUSTOMER_CONFIG } from "@/lib/receipt-schema";

describe("parseReceiptConfig", () => {
  it("returns the default config for empty/garbage input", () => {
    expect(parseReceiptConfig(null, "customer").receiptType).toBe("customer");
    expect(parseReceiptConfig("notjson", "kitchen").receiptType).toBe("kitchen");
  });

  it("strips legacy section types (logo, qr_code)", () => {
    const saved = JSON.stringify({
      version: 2, receiptType: "customer", thankYouMessage: "", footerText: "",
      sections: [
        { id: "logo1", type: "logo", label: "", enabled: true, style: {} },
        { id: "qr1", type: "qr_code", label: "", enabled: true, style: {} },
      ],
    });
    const cfg = parseReceiptConfig(saved, "customer");
    expect(cfg.sections.some((s) => s.type === "logo")).toBe(false);
    expect(cfg.sections.some((s) => (s.type as string) === "qr_code")).toBe(false);
  });

  it("back-fills missing default sections", () => {
    const saved = JSON.stringify({
      version: 2, receiptType: "customer", thankYouMessage: "", footerText: "", sections: [],
    });
    expect(parseReceiptConfig(saved, "customer").sections.length).toBe(DEFAULT_CUSTOMER_CONFIG.sections.length);
  });

  it("falls back to defaults when the receiptType doesn't match", () => {
    const saved = JSON.stringify({ version: 2, receiptType: "kitchen", sections: [] });
    const cfg = parseReceiptConfig(saved, "customer");
    expect(cfg.receiptType).toBe("customer");
    expect(cfg.sections.length).toBe(DEFAULT_CUSTOMER_CONFIG.sections.length);
  });
});
