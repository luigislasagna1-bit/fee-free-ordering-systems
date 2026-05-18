import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  for (const id of ["claude-sonnet-4-5", "claude-3-5-sonnet-latest"]) {
    try {
      const r = await c.messages.create({
        model: id,
        max_tokens: 20,
        messages: [{ role: "user", content: "Reply OK." }],
      });
      console.log(`✅ ${id}: ${(r.content[0] as any).text}`);
    } catch (e: any) {
      console.log(`❌ ${id}: ${e.status} ${e.message?.slice(0, 100)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
