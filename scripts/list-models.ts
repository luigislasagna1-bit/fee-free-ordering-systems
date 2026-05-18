import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const r = await c.models.list({ limit: 30 });
  for (const m of r.data) console.log(m.id, "-", m.display_name);
}

main().catch((e) => { console.error(e); process.exit(1); });
