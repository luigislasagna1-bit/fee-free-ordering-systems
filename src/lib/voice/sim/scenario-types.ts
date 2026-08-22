/**
 * The Nabil torture-test SCENARIO format (directive §22–§24).
 *
 * A scenario is a scripted (or LLM-simulated) caller plus the CANONICAL CART
 * the call must end with. The runner drives the REAL CallSession against an
 * offline backend built from a menu snapshot and compares the final cart —
 * never the transcript — against `expected`.
 */
export type CallerTurn =
  | string
  | {
      say: string;
      /** After this turn Nabil MUST ask a question and MUST NOT change the cart. */
      expectClarification?: boolean;
      /** Send a ConversationRelay `interrupt` this many ms after Nabil starts speaking. */
      interruptAfterMs?: number;
      /** Wait this long before sending (simulates a slow caller). */
      delayMs?: number;
      /** If Nabil's last utterance matches a key (regex source), say that value instead. */
      ifAsked?: Record<string, string>;
    };

export type CanonicalTopping = string; // lowercased resolved name; "2x mushroom" for doubles

export type CanonicalPick = {
  /** Slot label as the compiler reports it (lowercased), or "" when unknown. */
  slot: string;
  item: string; // menuItemId
  itemAlt?: string[];
  name?: string;
  size?: string; // variant name, lowercased
  options: string[]; // simple-item option names, lowercased, sorted
  halves?: { left: CanonicalTopping[]; right: CanonicalTopping[]; whole: CanonicalTopping[] };
  excluded?: string[];
};

export type CanonicalLine = {
  item: string; // menuItemId
  /** EXPECTED only: other menuItemIds accepted for this line (a menu where
   *  "Large 1 Topping"/"Large 2 Topping"/"Large 3 Topping" are separate
   *  products prices them the same for the same toppings, so a caller who says
   *  "a large with pepperoni and mushrooms" may legitimately land on either). */
  itemAlt?: string[];
  name?: string; // for humans; not compared
  size?: string; // variant name lowercased (simple/pizza with variants)
  qty: number;
  /** Simple-item options (lowercased, sorted). For pizzas: crust/sauce/cheese choices that the caller named. */
  options: string[];
  halves?: { left: CanonicalTopping[]; right: CanonicalTopping[]; whole: CanonicalTopping[] };
  excluded?: string[];
  picks?: CanonicalPick[];
  note?: string;
};

export type CanonicalCart = { lines: CanonicalLine[] };

export type ScenarioSuite = "critical" | "broad" | "injection" | "stress" | "regression";

export type Scenario = {
  id: string; // "T03_half_half"
  title: string;
  suite: ScenarioSuite[];
  /** Fixture slug under src/lib/voice/sim/fixtures/<restaurant>.menu.json */
  restaurant: string;
  taxonomy: string[];
  backend?: {
    open?: boolean;
    /** Owner service pauses (Temporary Closure). Omit `pausedUntil` in
     *  committed scenarios so the timestamp gate never self-heals the pause
     *  as wall-clock time passes — bare `pausedNow` gates forever. */
    paused?: Partial<Record<"pickup" | "delivery", { pausedUntil?: string; resumesLocal?: string }>>;
    soldOut?: string[]; // menuItemIds forced sold out
    returningCaller?: unknown;
    /** A5: seeded orders the caller already placed (recent-orders route shape). */
    recentOrders?: unknown;
    /** ms of latency added to every backend call (tests the filler + timeouts). */
    latencyMs?: number;
    /** Fail the next call to this method once with this code. */
    failNext?: { method: string; code: string };
    /** Agent config overrides (allowPizzaCombo etc.). */
    config?: Record<string, unknown>;
  };
  caller:
    | {
        mode: "script";
        turns: CallerTurn[];
        /**
         * Standing answers keyed by regex source over Nabil's LAST utterance.
         * When Nabil asks something these cover (name, callback number, "anything
         * else?"), the caller answers with the value and the scripted turn is
         * NOT consumed — it is said on the following turn. Lets one script survive
         * Nabil asking for the name at turn 1 or turn 5.
         */
        answers?: Record<string, string>;
        /** Max caller turns before giving up (default turns.length + 12). */
        maxTurns?: number;
      }
    | { mode: "llm"; persona: string; goal: string; noise?: "none" | "light" | "heavy"; maxTurns?: number };
  expected: {
    cart: CanonicalCart;
    fulfilment?: { type: "pickup" | "delivery"; address?: string };
    customer?: { name?: string; phone?: string };
    mustPlace: boolean;
    /** Caller-turn indexes (0-based) after which Nabil must clarify (ask) and not mutate. */
    mustClarifyAt?: number[];
    /** Regex sources over everything Nabil said. */
    mustNotSay?: string[];
    /** Regex sources at least one Nabil utterance must match. */
    mustSay?: string[];
    /** A1b: the call MUST end in a hand-off to a person (transfer_to_human
     *  succeeded, the session sent `end` with a reason). Without it, an
     *  agent-ended call is a failure as before. */
    mustTransfer?: boolean;
    /** Injection suite: tools outside this list must not be called successfully. */
    allowedTools?: string[];
    maxToolErrors?: number;
    /** Optional: exact quoted total (from the fake pricer at authoring time). */
    totalCents?: number;
  };
};

export type ScenarioTurnRecord = {
  idx: number;
  /** Index into `caller.turns` this utterance came from (script mode); null
   *  for a standing `answers` reply, an LLM-caller turn, or a synthetic turn.
   *  `mustClarifyAt` / `expectClarification` are checked against THIS. */
  scriptIndex?: number | null;
  caller: string;
  agent: string;
  toolCalls: Array<{ name: string; input: unknown; ok: boolean; code: string | null; ms: number }>;
  cartHashBefore: string | null;
  cartHashAfter: string | null;
  ttftMs: number | null;
  clarified: boolean;
};

export type CartDiff = {
  exact: boolean;
  missing: CanonicalLine[];
  extra: CanonicalLine[];
  matched: number;
  items: { correct: number; total: number };
  sizes: { correct: number; total: number };
  qty: { correct: number; total: number };
  modifiers: { correct: number; total: number };
  halves: { correct: number; total: number };
  comboSlots: { correct: number; total: number };
  humanSummary: string[];
};

export type ScenarioReport = {
  id: string;
  run: number;
  pass: boolean;
  reasons: string[];
  cartDiff: CartDiff;
  actualCart: CanonicalCart;
  placed: boolean;
  fulfilment: { type: string | null; address?: string } | null;
  customerName: string | null;
  turns: ScenarioTurnRecord[];
  hallucinationFlags: Array<{ turn: number; kind: string; detail: string }>;
  clarifications: { expectedAt: number[]; actualAt: number[] };
  mustNotSayHits: string[];
  latency: { ttftP50: number | null; ttftP95: number | null; toolP95: number | null };
  usage: { in: number; out: number; cacheRead: number; cacheWrite: number };
  costCents: number;
  durationMs: number;
  versions: Record<string, unknown>;
  transcript: Array<{ role: string; text: string }>;
};
