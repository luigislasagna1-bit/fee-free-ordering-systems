import { describe, it, expect } from "vitest";
import { safeJsonLd } from "./safe-json-ld";

const LS = String.fromCharCode(0x2028); // U+2028 line separator
const PS = String.fromCharCode(0x2029); // U+2029 paragraph separator

describe("safeJsonLd", () => {
  it("neutralizes a </script> breakout in an owner-controlled field", () => {
    const out = safeJsonLd({ name: "</script><script>alert(document.cookie)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
  });

  it("escapes & so the output can't form an HTML entity a parser might rewrite", () => {
    expect(safeJsonLd({ x: "a & b" })).not.toContain("&");
  });

  it("escapes U+2028 / U+2029 line separators", () => {
    const out = safeJsonLd({ x: `a${LS}b${PS}c` });
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
  });

  it("still produces valid JSON that round-trips to the original value", () => {
    const value = { name: "</script>", desc: "Tom & Jerry's", tag: `x${LS}y` };
    expect(JSON.parse(safeJsonLd(value))).toEqual(value);
  });

  it("leaves ordinary content readable (only the dangerous chars escaped)", () => {
    expect(safeJsonLd({ city: "Milton" })).toBe('{"city":"Milton"}');
  });
});
