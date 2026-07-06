/**
 * Serialize a value for embedding inside a <script type="application/ld+json">
 * block. `JSON.stringify` alone is NOT safe here: it leaves `<`, `>`, `&`,
 * U+2028 and U+2029 literal, so any string field sourced from an untrusted
 * place (a restaurant OWNER controls their name / description / address, and
 * those land in JSON-LD on the public hosted site + white-label domains) can
 * contain a literal `</script>` and break out of the script element, executing
 * on every visitor. Escaping `<` stops the breakout; escaping `>`, `&`, U+2028
 * and U+2029 keeps the output valid, injection-proof JSON (and safe even if
 * reused for an executed inline-JSON block).
 *
 * Use this for EVERY `application/ld+json` dangerouslySetInnerHTML emit — even
 * ones that currently only serialize constant strings, so a future edit that
 * introduces a dynamic field can't reopen the hole. (Red-team 2026-07-06.)
 */
const BACKSLASH = String.fromCharCode(92); // avoid a literal backslash in source
// Char class built at runtime: U+2028/U+2029 are line terminators and cannot
// appear raw in a regex LITERAL, so assemble the pattern from a string.
const DANGEROUS = new RegExp("[<>&" + String.fromCharCode(0x2028, 0x2029) + "]", "g");

export function safeJsonLd(value: unknown): string {
  // Escape the five characters that are legal in a JSON string but dangerous
  // inside an HTML <script> element, to their \uXXXX forms.
  return JSON.stringify(value).replace(
    DANGEROUS,
    (c) => BACKSLASH + "u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
