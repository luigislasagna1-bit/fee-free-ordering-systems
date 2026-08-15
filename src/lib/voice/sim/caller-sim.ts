/**
 * The LLM CALLER — a small model playing a customer with a persona and a goal,
 * answering only what Nabil asks, pursuing the goal, and hanging up once the
 * order is confirmed placed (or after Nabil has refused twice).
 *
 * The caller sees ONLY the spoken transcript (never Nabil's tools or state),
 * exactly like a human on the line. `<HANGUP>` is the one control token.
 */
import { applyAsrNoise, type NoiseLevel } from "./asr-noise";

/** The slice of the Anthropic client both the session and this file need. */
export type AnthropicLike = {
  messages: {
    stream: (params: any, opts?: { signal?: AbortSignal }) => {
      on: (evt: string, cb: (delta: string) => void) => unknown;
      finalMessage: () => Promise<any>;
    };
  };
};

export const HANGUP = "<HANGUP>";
export const DEFAULT_CALLER_MODEL = "claude-haiku-4-5";

export type CallerTranscriptEntry = { role: "caller" | "nabil"; text: string };

export type NextCallerArgs = {
  anthropic: AnthropicLike;
  model?: string;
  persona: string;
  goal: string;
  transcript: CallerTranscriptEntry[];
  noise?: NoiseLevel;
  rng?: () => number;
  /** Turn number (1-based) — used for the first-utterance instruction. */
  turn?: number;
};

export function callerSystemPrompt(persona: string, goal: string): string {
  return [
    "You are a CUSTOMER phoning a pizzeria. You are NOT the assistant — the restaurant's phone agent (Nabil) is the assistant; you are the person calling.",
    `Who you are: ${persona}`,
    `What you want from this call: ${goal}`,
    "",
    "Rules:",
    "- Speak like a real caller on the phone: short, natural, one or two sentences. No lists, no markdown, no stage directions.",
    "- Answer ONLY what Nabil just asked, then add the next thing YOU need to say to move toward your goal. Do not volunteer everything at once unless a real person would.",
    "- Never invent menu item ids or internal terms. Say things the way a customer says them.",
    "- If Nabil reads the order back and it is right, say yes. If it is wrong, correct exactly the wrong part.",
    "- If Nabil asks for your name / callback number / pickup-or-delivery / address, answer from your persona (make up a plausible name or number if none is given, and keep it consistent).",
    "- When Nabil confirms the order has been PLACED (an order number, 'it's in', 'placed'), or after Nabil has refused what you want twice, reply with exactly: " + HANGUP,
    "- Never say " + HANGUP + " before the order is placed or refused twice.",
    "- Output ONLY the words you say on the phone (or the hang-up token). Nothing else.",
  ].join("\n");
}

/** Ask the caller model for its next line. Returns the spoken text or `<HANGUP>`. */
export async function nextCallerUtterance(args: NextCallerArgs): Promise<string> {
  const model = args.model || DEFAULT_CALLER_MODEL;
  // The caller is the ASSISTANT of this side-conversation; Nabil's words are
  // the "user". Merge consecutive same-role entries, start and end on "user".
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const t of args.transcript) {
    const role: "user" | "assistant" = t.role === "nabil" ? "user" : "assistant";
    const text = t.text.trim() || (role === "user" ? "(Nabil is silent.)" : "(…)");
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += `\n${text}`;
    else messages.push({ role, content: text });
  }
  if (!messages.length || messages[0].role !== "user") {
    messages.unshift({ role: "user", content: "(The line connects. Nabil has picked up. Say your opening line.)" });
  }
  if (messages[messages.length - 1].role !== "user") messages.push({ role: "user", content: "(Nabil said nothing. Continue.)" });
  const stream = args.anthropic.messages.stream({
    model,
    max_tokens: 200,
    system: callerSystemPrompt(args.persona, args.goal),
    messages,
  });
  const final = await stream.finalMessage();
  const text = (Array.isArray(final?.content) ? final.content : [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => String(b.text ?? ""))
    .join("")
    .trim();
  if (!text) return HANGUP;
  if (text.includes(HANGUP)) return HANGUP;
  const clean = text.replace(/^["“”']+|["“”']+$/g, "").trim();
  return applyAsrNoise(clean, args.noise ?? "none", args.rng);
}
