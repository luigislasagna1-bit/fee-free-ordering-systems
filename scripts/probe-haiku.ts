import Anthropic from "@anthropic-ai/sdk";

const candidates = [
  "claude-haiku-4-5",
  "claude-haiku-4-5-20251001",
  "claude-haiku-4-5-20251022",
  "claude-haiku-4",
  "claude-4-5-haiku-latest",
  "claude-4-5-haiku",
  "claude-haiku-4-5-latest",
];

async function main() {
  const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  for (const id of candidates) {
    try {
      const r = await c.messages.create({
        model: id,
        max_tokens: 50,
        messages: [{ role: "user", content: "Reply with the word OK." }],
      });
      const text = (r.content[0] as any).text;
      console.log(`✅ ${id}  →  ${text.slice(0, 30)}`);
    } catch (err: any) {
      console.log(`❌ ${id}  →  ${err?.status || ""} ${err?.message?.slice(0, 100)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
