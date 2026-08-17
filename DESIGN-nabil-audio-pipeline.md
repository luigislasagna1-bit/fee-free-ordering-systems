# Nabil AI — owning the audio pipeline (Twilio Media Streams + Deepgram + ElevenLabs + ambience) — design (2026-08-17)

Luigi's decision (OWNER-ACTIONS **A64(c)**, TODO.md top entry "(c)"): build **background restaurant ambience completely**.
Research on 2026-08-16 settled that it cannot be done on ConversationRelay (no background-audio attribute; its `play`
message is a queued talk-cycle item that *replaces* the voice; a relay leg cannot join a conference). The only real
route is to **own the phone audio**: `<Connect><Stream>` (Media Streams, µ-law 8 kHz both ways) → our own streaming
STT (Deepgram) → **the same turn loop / tools / cart engine** (`services/nabil-voice/src/session.ts`) → our own
streaming TTS (ElevenLabs, `ulaw_8000`) **mixed with an ambience bed** → back to Twilio as outbound media.

Everything below was written against the code as it is today (files named), not against the docs' idea of it.

---

## 1. Goals / non-goals

**Goals**
1. A continuous restaurant ambience bed under Nabil (per-store `VoiceAgentConfig.ambientNoise` finally does something).
2. **Zero behavioural regressions** in the turn loop: authoritative cart, sentence-chunk TTS + narration filter +
   spoken-numbers, barge-in semantics (`utteranceUntilInterrupt`, stale / protected windows), early + tail fragments,
   fillers, bookkeeping merge, drain / capacity / per-store fallback numbers, recording, transfer, DTMF, languages, the
   call log + timeline + versions, the quoted≠charged alarm, Sentry.
3. A **per-store switch** (`audioPipeline: "conversationrelay" | "mediastreams"`), Luigi's line first, ConversationRelay
   kept as the automatic fallback — before the first turn *and* as the default for every other store.
4. Cost known per call-minute *before* GA (new lines: Deepgram, ElevenLabs, Media Streams) and re-checked against the
   US$0.60/min price.
5. Testable without a telephone (fake providers for `npm test`; a loopback script with real keys for the release gate).

**Non-goals (v1)**: ambience during transfer hold (Twilio's `<Dial>` owns the leg then); a per-store choice of bed (one
bed, one gain, env-tunable); AEC / noise suppression of the caller's audio; replacing Twilio as carrier; any change to
`cart-engine.ts`, `tools.ts`, `prompt.ts`, the money path, or the sim scenarios.

---

## 2. Architecture

```
 PSTN caller ─ Twilio ─ POST /api/twilio/voice (Vercel, TwiML) ──────────────────────────────┐
                │        audioPipeline==="mediastreams" ⇒                                    │
                │        <Connect action=AFTER><Stream url="wss://fly/media?t=JWT">           │
                │           <Parameter name="greeting" …/></Stream></Connect>                 │
                │        <Redirect>AFTER</Redirect>   (AFTER = /api/twilio/voice/after-stream) │
                ▼                                                                             │
   WSS /media  (Fly, services/nabil-voice/src/server.ts — second WebSocketServer path)        │
   ┌────────────────────────── MediaSession (new: src/media/media-session.ts) ─────────────┐  │
   │ Twilio events ─► inbound µ-law frames ─► [echo/backchannel gate] ─► Deepgram WS (STT)   │  │
   │   connected/start/media/dtmf/mark/stop      ▲ VAD + interims = barge-in detector       │  │
   │                                             │                                          │  │
   │            {type:"setup"|"prompt"|"interrupt"|"dtmf"}  ── the ConversationRelay-shaped │  │
   │            messages the session ALREADY understands ─►  CallSession (session.ts,       │  │
   │                                                          UNCHANGED turn loop/tools/cart)│  │
   │            {type:"text",token,last} / {type:"end",handoffData} ◄─ ws.send() from session│  │
   │                        │                                                               │  │
   │                        ▼  ElevenLabs stream-input WS  (turbo_v2_5, ulaw_8000, alignment)│  │
   │              voice queue (µ-law bytes + text + alignment per chunk)                     │  │
   │                        │                                                               │  │
   │   bed.ts (shared Int16 loop) ─► mixer.ts: PCM16 = voice + bed×gain(duck) → µ-law        │  │
   │                        ▼                                                               │  │
   │   pacer.ts: one 160-byte frame per 20 ms, ≤200 ms ahead of real time ─► {event:"media"} │  │
   │            + {event:"mark"} per spoken chunk (Twilio echoes it back = ground truth)      │  │
   └───────────────────────────────────────────────────────────────────────────────────────┘  │
                │ close WS (transfer / early failure / hangup)                                 │
                ▼                                                                             │
   /api/twilio/voice/after-stream  ◄── looks up the HANDOFF INTENT the service posted first ───┘
        transfer            → <Dial> store (today's handoff logic, same number precedence)
        pipeline_failed     → ConversationRelay TwiML for the SAME call (fallback before first turn)
        none + 0 user turns → ConversationRelay TwiML;  none + turns → <Dial> store (today's behaviour)
```

**Key design choice — an adapter, not a rewrite.** `CallSession` only ever calls `ws.send(JSON)` with
`{type:"text",token,last}` / `{type:"end",handoffData}` and only ever receives `setup|prompt|interrupt|dtmf|error`
(`session.ts` `onMessage`, `wsSendText`, `endTransfer`). `MediaSession` presents itself to `CallSession` as that
"ws" and speaks that protocol internally. The turn loop, tools, cart, spoken-numbers, narration filter, fillers,
compaction, events, versions and `finalize()` are reused **byte-for-byte**; the sim harness's `fake-ws.ts` stays valid.
`server.ts` gains a `/media` path beside `/call`; the `active` set, `draining`, `maxSessions` and the capacity alert
cover both.

### 2.1 Message flows

**Call start.** Twilio POSTs `/api/twilio/voice` (signature-verified as today) → the route reads `voiceAgentConfig`
(add `audioPipeline`, `ambientNoise`, `voice`, `voiceSpeed`) → for `mediastreams` it mints the JWT
(`src/lib/voice/session-token.ts`: + `pipeline`, `voiceId`, `ttsModel`, `speed`, `stability`, `similarity`,
`ambient`, `sttModel`, `lang`, `greeting` ≤ 300 chars) and returns the TwiML above. Twilio connects `wss://…/media?t=`
→ `server.ts` verifies the token, refuses on `draining` / capacity (1013) exactly like `/call` → `MediaSession`
receives `connected` then `start` (`streamSid`, `callSid`, `customParameters`, `mediaFormat audio/x-mulaw 8000`).
It **checks `start.callSid === token.callSid`** (1008 otherwise), opens the Deepgram WS, starts the bed **on the very
first outbound frame** (if `ambient`), queues the greeting audio, and sends `{type:"setup"}` to `CallSession` so
`init()` (menu + context + returning caller) runs in parallel — same ordering as today, where Twilio speaks
`welcomeGreeting` while `init()` loads.

**Greeting + cold start.** With Media Streams *we* speak the greeting. It is fixed per (store, open/closed,
recordCalls) so its µ-law is cached in-process keyed on `hash(text, voiceId, model, speed, stability, similarity,
lang)` (LRU, ~50 KB/entry): first call per store per process pays one ElevenLabs round trip (~300–500 ms TTFB); the
bed is already playing, so the caller hears "a restaurant" and then Nabil within ≈0.5–1 s of pickup — comparable to
Twilio's own `welcomeGreeting` start. Cache seeding by the TwiML route is unnecessary. The greeting is barge-in-able
(`welcomeGreetingInterruptible="speech"` parity) and its text is known to the adapter, which finally makes the
**greeting-echo guard** (TODO: call `cmsw33f3l`, "This call may be recorded" heard back as caller speech) a
one-liner: an utterance that is a ≥3-word prefix of what we are currently playing is dropped and its interrupt is
stale. Fillers (`FILLER_PHRASES`, `THINKING_FILLER_PHRASES`, "Sorry — let me say that again.", the
`shutdownTransfer` sentence) are cached the same way — zero TTS latency and zero characters after first use.

**Inbound audio → Deepgram.** Every 20 ms Twilio sends `{event:"media", media:{track:"inbound", timestamp,
payload}}` (160 bytes µ-law). Forwarded raw to Deepgram (`encoding=mulaw&sample_rate=8000&channels=1`) — no
transcoding on the inbound path. Parameters mirror today's TwiML: `model=nova-3` (Twilio's `nova-3-general`),
`language=<bcp47>` or `language=multi`, `interim_results=true`, `endpointing=300`, `utterance_end_ms=1200`,
`vad_events=true`, `punctuate=true`, `smart_format` from `NABIL_DEEPGRAM_SMART_FORMAT` (their finding: off ⇒ "half"
stops arriving as "0.5"), `filler_words=false`, `KeepAlive` every 5 s, `CloseStream` at end. Turn end =
`speech_final` (or `UtteranceEnd` as the backstop) → `normalizeAsr` still runs inside `session.onMessage`.
`NABIL_STT_MODEL=flux` stays as the experiment lever: Flux (`/v2/listen`, `EndOfTurn` / `EagerEndOfTurn` /
`TurnResumed`, `eot_threshold`) — English-only, and it takes linear16, so the adapter decodes µ-law→PCM16 first (a
table lookup it does anyway for the mixer). Flux's `EagerEndOfTurn` is a real latency lever later (start the model
speculatively, abort on `TurnResumed`) — not v1. **Hints:** today the TwiML `hints` attribute (500-char ceiling,
`packHints` in `src/lib/voice/speech-hints.ts`) biases Deepgram; now the same list rides as Deepgram **`keyterm`**
parameters (Nova-3 / Flux; `keywords=term:boost` on Nova-2 for the languages Nova-3 lacks) with a much larger budget
(Deepgram's own limit — plan on ≤100 terms; verify). Move `menuHints()` out of `src/app/api/twilio/voice/route.ts`
into `src/lib/voice/speech-hints-server.ts` and expose the list on the **context payload**
(`src/lib/voice/context-payload.ts` → `sttHints: string[]`) so the token stays small and the sim's offline backend
can serve it too. Toppings-first ordering and the `ORDER BY name` determinism are kept.

**Turn detection, barge-in, "what the caller heard".** Today Twilio decides interruption (`interruptible="any"`,
`interruptSensitivity="low"`, `ignoreBackchannel="true"`) and tells us `utteranceUntilInterrupt`; `session.ts` then
classifies it (stale vs. this turn, `protectedUntil`, `INTERRUPT_GRACE_MS`, `lastBargeInAt`). New: the adapter owns
detection and **synthesises the same `interrupt` message**, so the classification code is untouched. While the voice
queue is non-empty ("speaking"): a Deepgram interim with ≥`NABIL_BARGE_MIN_WORDS` (2) words that is *not* a
backchannel (`mm-hmm|yeah|okay|right|uh-huh|sure` alone → ignored, parity with `ignoreBackchannel`) and *not* an
echo of our own current text ⇒ barge-in: drop the voice queue (the bed continues seamlessly — no `clear` needed
because we never send far ahead), compute the heard prefix, send `{type:"interrupt", utteranceUntilInterrupt}`. The
heard prefix is **ours to compute, better than today's**: the pacer knows exactly how many voice samples of which
chunk have left for Twilio; subtract the ≤200 ms lead; ElevenLabs' per-chunk `alignment` (character start times) maps
samples → characters, so the prefix is character-exact instead of Twilio's best guess. Twilio's `mark` echoes (one
per spoken chunk) calibrate the lead and give a true "playback ended" instant; v1 keeps `estimateSpeechMs` for the
early-fragment silence timer, v1.1 feeds the real playback end through a new optional `SessionDeps` hook (the harness
seam rule from 2026-08-16 applies).

**TTS streaming.** Per turn the adapter opens an ElevenLabs stream-input WebSocket
(`/v1/text-to-speech/{voiceId}/stream-input?model_id=eleven_turbo_v2_5&output_format=ulaw_8000&language_code=…`,
`voice_settings` from the token = the values `buildVoiceAttrValue` encodes today; the voice ids in
`src/lib/voice/elevenlabs-voices.ts` are ElevenLabs ids already), opened **at turn start in parallel with the model
request** so its handshake is hidden behind TTFT; text arrives via `wsSendText` → `{text}` messages, `last:true` ⇒
`flush` + close; HTTP `/stream` per sentence is the fallback path. **Sentence-chunk mode is the default for this
pipeline** (`NABIL_TTS_CHUNK=sentence` — whole clauses to the voice, narration filter armed, numbers never split;
`numberSafeFlushIndex` already exists). Latency budget (caller stops → first audio): endpointing 300 + Deepgram ~100 +
model TTFT p50 ≈ 1.2 s + first clause ≈ 0.5 s + ElevenLabs TTFB ≈ 0.3 s + Twilio ≈ 0.1 s ≈ **2.5 s p50** — roughly
today's sentence-mode figure, ~0.2–0.4 s slower than token mode; recovered on the greeting/fillers (cached) and,
later, Flux eager end-of-turn.

**The ambience mixer** (`src/media/bed.ts`, `mixer.ts`, `pacer.ts`, `mulaw.ts`). The bed is one 60–120 s seamless
loop, 8 kHz mono PCM16 (~1–2 MB, `services/nabil-voice/assets/ambience/<id>.pcm` + `LICENSE.md` with the licence
receipt — a CC0 or commercially licensed clip Luigi picks; no intelligible speech in it), decoded once at boot into a
shared `Int16Array`, each call starting at a random offset so concurrent calls don't sound cloned. Every 20 ms the
mixer builds 160 samples: `out = voice + bed·g`, `g = 10^(dB/20)`; a soft limiter (`tanh`-style knee above −1 dBFS)
prevents wrap; then PCM16→µ-law. **Recommendation: continuous low bed + a slight duck under speech** — present the
whole call (it also softens the silence during tool hops and TTFT, which callers hear as "dead air" today), −20 dB
relative to speech RMS by default (bed ≈ −40 dBFS RMS against speech at ≈ −20 dBFS RMS), ducked a further 3–4 dB
while voice samples are flowing (50 ms ramps). Levels are env-tunable (`NABIL_BED_GAIN_DB=-20`, `NABIL_BED_DUCK_DB=-3`)
and stamped on the call's versions. Bed **only when `cfg.ambientNoise`** (context payload → `normalizeAgentConfig`
gains `ambientNoise: boolean`, default false); off ⇒ `g = 0`, the pipeline is otherwise identical. The Settings toggle
loses its "coming soon" badge (`NabilConfigClient.tsx`, ×38) and is shown as active only for stores on
`mediastreams` (feature-gated visibility rule). Twilio's `<Stream>` accepts outbound media faster than real time and
buffers it, but a bed **must** be paced: one shared 20 ms ticker for all sessions (not a timer per call), drift-corrected
against `process.hrtime`, emitting whatever frames are due, holding ≤200 ms of lead so a barge-in cut lands within
~200 ms (Twilio's own cut today is of that order).

**DTMF.** Media Streams sends `{event:"dtmf", dtmf:{digit}}` → adapter sends `{type:"dtmf", digit}` → the existing
`(pressed N)` prompt path (`isEarlyFragment` already exempts it).

**Transfer to a human / call time limit / mid-call fatal.** Today `{type:"end", handoffData:{reason}}` ends the relay
and Twilio POSTs `<Connect action>` (`/api/twilio/voice/handoff`), which reads `HandoffData`. `<Stream>` has no
`HandoffData`, so the adapter's `end` = **(1) let the voice queue play out** (bounded ≤8 s — the "putting you
through" sentence must be heard, also for `shutdownTransfer`), **(2) `POST /api/internal/voice/call-log
{event:"handoff", callSid, reason}`** (new event kind; awaited with the 8 s timeout; stores `VoiceCall.handoffReason`
— a nullable column on a non-hot table, or reuse `transferReason` written early), **(3) close the WS**. `<Connect>`
ends → `action` fires (`<Connect action>` is documented for `<Connect>`; the Phase-0 spike verifies it fires for
`<Stream>` and for a socket that never connects) — and, belt and braces, `<Redirect>` to the **same** route follows
in the TwiML, so if `action` didn't fire the next verb does. `/api/twilio/voice/after-stream` (signature-verified,
fail-closed like the two existing routes, wrapped in `safetyNetTwiml`) reads the intent by `CallSid`: `transfer` /
`service_restart` / `agent struggling…` ⇒ the existing `<Dial>` logic (extract `handle()`'s number precedence
`transferToNumber → alertPhone → phone` into `src/lib/voice/handoff-twiml.ts` shared by both routes);
`call_time_limit` ⇒ `TIME_LIMIT_BYE` + `<Hangup/>`; `pipeline_failed` ⇒ ConversationRelay TwiML (below). Recording,
`finalize()`, the SMS text-back and the call log are unchanged (`finalize()` runs on WS close as now).

**Recording.** Unchanged: `call-log start` → `startCallRecording()` (REST) records the call leg — which now contains
the bed. Consent line stays part of the greeting text.

**Drain / capacity / fallback.** Same `active` set, `draining` flag, 503 `/health`, `maxSessions` refuse (1013 → the
after-stream route rings the store within a second, as the handoff route does today). `shutdownTransfer()` works
through the adapter (cached sentence, wait for playback, intent, close, `finalize()`). New: the adapter counts
provider readiness — a Deepgram or ElevenLabs connect failure **before the first `prompt`** is a `pipeline_failed`
end (§3), and provider concurrency ceilings (Deepgram PAYG streams, ElevenLabs tier concurrency) are surfaced on
`/health` (`stt=ok tts=ok quota=…%` via ElevenLabs `/v1/user/subscription`, alert at 80 %). Twilio's
`VoiceFallbackUrl` → Fly `/twiml/fallback` and the per-store number map (`fallback.ts`, `twiml-safety-net.ts`,
`fallback-memo-prime.ts`) are untouched — the rule that every number is per store holds.

**Languages.** Today: `language="<bcp47>"` + `<Language code="multi"/>` when the owner listed extra languages
(Deepgram + ElevenLabs required). New: Deepgram `language=multi` on Nova-3 (code-switching across its 10 languages;
per-result `languages` sets `session.language` exactly as `msg.lang` does today, so the spoken-numbers English gate
and the compaction ledger keep working); Nova-2 with `language=<code>` for the locales Nova-3 lacks; ElevenLabs
turbo v2.5 speaks 32 languages with `language_code` forced from the detected/configured language. The 14 locales
missing from `BCP47` in the TwiML route (completeness-sweep item 5) get filled in the same change since the map now
feeds both pipelines.

**Call token / versions.** `Versions` (`versions.ts`) gains `audioPipeline`, `sttProvider`, `ttsModel`, `bedId`,
`bedGainDb`; `call_start` events and `VoiceCall` keep them in the `versions`/`latency` JSON (no new hot columns).
New timeline event types — `pipeline` (start/fallback/end with provider timings), `barge_in` (heard chars, cause),
`playback` (mark round-trips), `stt_error`, `tts_error` — **must be added to `EVENT_TYPES` in
`src/app/api/internal/voice/call-log/validation.ts` and labelled ×38 in the same change** (the 2026-08-16 lesson:
two event kinds were silently discarded by that allow-list for days). Cost accounting: `call_end.usage` gains
`sttSeconds` and `ttsChars` so the dashboard's ¢/min can be all-in (unit prices as app env, e.g.
`NABIL_STT_CENTS_PER_MIN`, `NABIL_TTS_CENTS_PER_1K_CHARS`); `costCents` stays the model share for continuity.

**Security / privacy.** JWT in the URL as today (2-min TTL) + `start.callSid` match + optional `start.accountSid`
match; no audio is stored by us (Twilio's recording remains the only copy); no new PII tables (PII_ERASURE_MAP
unchanged); Deepgram + ElevenLabs become sub-processors → privacy-policy list; opt out of Deepgram's model-improvement
program (`mip_opt_out=true`, small surcharge — Luigi's call, §7).

### 2.2 Behaviours that must survive (A55 / A58 ledgers) — where they live under the new pipeline

| Behaviour | Today | Media Streams |
|---|---|---|
| Authoritative cart, tools, STATE block, compaction, claims guard | `session.ts` + `cart-engine.ts` | unchanged (adapter) |
| Sentence-chunk TTS, narration filter, spoken numbers, number-safe splits | `sendText → speakClause → wsSendText` | unchanged; sentence mode default |
| Barge-in: `utteranceUntilInterrupt`, stale, protected windows, `protected_respoken` | Twilio `interrupt` → `onMessage` | adapter synthesises `interrupt` with an exact heard prefix |
| Early / tail fragments, fillers, thinking filler, bookkeeping merge | timers in `session.ts` | unchanged; v1.1 real playback-end |
| Greeting + consent line, interruptible greeting | TwiML `welcomeGreeting` | adapter, cached µ-law, echo-guarded |
| DTMF | Twilio `dtmf` | Media Streams `dtmf` |
| Transfer, call time limit, struggle hand-off, `service_restart` | `end` + `<Connect action>` handoff route | play-out → handoff intent → close → after-stream route |
| Drain, capacity cap, per-store fallback numbers, `/twiml/fallback` | `server.ts`, `fallback.ts` | same; + provider health |
| Recording (REST), quoted≠charged alarm, call log, timeline, Sentry redaction | app + `observability.ts` | unchanged; new event types allow-listed |
| STT hints, multilingual, versions stamped | TwiML attrs, token | Deepgram `keyterm`/`multi`, token + versions |
| Sim harness / release gate | `fake-ws.ts`, `nabil:release` | unchanged for CR; fake providers + loopback for media |

---

## 3. The per-store switch and the automatic fallback

- **Schema:** `VoiceAgentConfig.audioPipeline String @default("conversationrelay")` — pushed to **both** Neon branches
  (`scripts/push-schema-to-both.ts`). Set only by superadmin (Superadmin › Nabil Phone Lines shows the pipeline per
  line + a flip; not on the store's Settings — it is an operations choice). Luigi's store is flipped first, by hand.
- **TwiML route:** one builder per pipeline (`buildConversationRelayTwiml()` = today's string, byte-identical;
  `buildMediaStreamsTwiml()`), chosen by `cfg.audioPipeline` **and** by a circuit breaker (below).
- **Automatic fallback before the first turn — the exact mechanism.** If the adapter fails before the first caller
  `prompt` (no `start` within 3 s of connect; Deepgram or ElevenLabs WS refuses / 401 / 402 / 429; the greeting
  request errors; the WS is refused for capacity or drain — that case already ends the `<Connect>`), it posts
  `{event:"handoff", reason:"pipeline_failed", detail}` (best effort) and closes. Twilio runs the after-stream route,
  which returns **the ConversationRelay TwiML for the same call** (same token minting, same greeting — shortened to
  "Sorry about that — how can I help?" if the intent says the greeting already played, so the caller is not greeted
  twice). If the intent is missing (the app was unreachable) and the call has **0 user turns**, the route still serves
  ConversationRelay; with turns it rings the store — today's behaviour for a died relay. Failures *after* the first
  turn are handled as today (2 stream failures ⇒ warm transfer) — a mid-call pipeline swap is not attempted.
- **Circuit breaker:** ≥3 `pipeline_failed` for a store within 10 min (read from `VoiceCall.handoffReason`, cheap
  indexed count, memoised 60 s per Vercel instance) ⇒ the TwiML route serves ConversationRelay directly and a Sentry /
  ops message fires; the switch itself is not flipped (a human decides).
- **Kill switch:** app env `NABIL_MEDIASTREAMS_ENABLED=false` forces ConversationRelay for everyone (deploy-free
  rollback path on Vercel; the Fly service needs nothing).

---

## 4. Cost per call-minute (US$; prices as I recall them — verify each on the vendor page before GA)

Agent speech volume, from the last six sim reports (`reports/nabil-sim/*.json`, 280 scenarios, 2,559 turns): **123
chars per agent turn, ~9 turns per call**; at ~5–6 turns per real minute ⇒ **≈ 600–750 chars/min** (a 3-minute order
≈ 2,200 chars). ElevenLabs bills turbo/flash v2.5 at **0.5 credit per character** ⇒ ≈ 375 credits/min. Planning
figure: **750 chars/min**.

| Line | ConversationRelay today | Media Streams |
|---|---|---|
| Twilio inbound voice (local number) | 0.85¢ | 0.85¢ |
| Twilio ConversationRelay (STT + TTS incl.) | 7.0¢ (measured on 5 real calls, COSTS.md) | — |
| Twilio Media Streams | — | 0.4¢ |
| Deepgram Nova-3 streaming, PAYG (always-on for the whole call) | in CR | 0.77¢ EN / 0.92¢ multi (Growth 0.65¢) |
| ElevenLabs turbo v2.5, ~375 credits/min | in CR | Creator $22/100k: 8.2¢ inclusive if the plan is used up, 11.3¢ overage ($0.30/1k) · Pro $99/500k: 7.4¢ incl., ~9¢ overage · Scale $330/2M: 6.2¢ incl., 6.8¢ overage |
| Twilio recording | 0.3¢ | 0.3¢ |
| Anthropic (unchanged) | ~20¢ (16–23¢ measured; ~30¢ from 2026-08-31 at Sonnet list price) | same |
| Fly (2× shared-cpu-1x ≈ $12/mo; a step to shared-cpu-2x ≈ $30/mo if CPU says so) | ≈0 at volume | ≈0–0.5¢ |
| **All-in, today's model price** | **≈ 28¢ (25–31¢)** | **≈ 30–33¢** (Scale → Creator overage) |
| **All-in from 2026-08-31** | **≈ 38¢ (34–40¢)** | **≈ 40–43¢**; worst case (Creator overage + bigger VM) ≈ 45¢ |

**Verdict:** the re-platform costs **+2 to +5¢ per minute** over ConversationRelay — essentially ElevenLabs'
per-character price minus Twilio's 7¢ bundle. Against **US$0.60/min** the gross margin is ≈ 27–30¢/min (45–50 %)
today and ≈ 17–20¢/min (28–33 %) after 31 August; the worst case still leaves ≈ 15¢ (25 %). **Margin survives at
every tier.** Tier: **Creator ($22/mo) for the pilot** (Luigi's line ≈ 100–250 min/mo), **Pro ($99) once ≥ ~1,000
min/mo across stores** (≈ 3 subscribed stores — the $249.99 monthly minimum per store dwarfs the plan fee), Scale
beyond ~5,000 min/mo. Turn on ElevenLabs usage-based overage or a mid-month quota exhaustion becomes `pipeline_failed`
on every call (which does fall back cleanly, but at ConversationRelay's cost and without the bed). Provider
concurrency matters more than credits at Friday peak: ElevenLabs caps concurrent generations per tier (Creator ≈ 10,
Pro ≈ 20 — verify); with agent-speech duty ≈ 40 %, 25 concurrent calls ≈ 10 concurrent generations ⇒ Pro before the
call cap is ever reached. The release gate's cost check (`scripts/nabil-release.ts`, model share ≤30¢ warn / ≤40¢
fail) gets an all-in column from the new `sttSeconds`/`ttsChars` counters. COSTS.md gains two rows (Deepgram,
ElevenLabs API) in the same change (standing rule).

---

## 5. Prerequisites only Luigi can do, and testing without a phone

**Luigi (accounts in his name; exact clicks when Phase 1 lands):**
1. **Deepgram** — console.deepgram.com → project → API key (Member scope is enough) → `fly secrets set --stage
   DEEPGRAM_API_KEY=… --app nabil-voice` (staged, so it ships with the deploy and no live call is restarted); billing =
   pay-as-you-go card (the sign-up credit covers the whole pilot).
2. **ElevenLabs** — an API plan (Creator to start; commercial use is included from Starter up) → API key with
   text-to-speech + user-read permissions → `fly secrets set --stage ELEVENLABS_API_KEY=…`; the same key as Vercel
   `ELEVENLABS_API_KEY` switches on the "hear this voice" preview (A45 step 3). Enable usage-based billing.
3. **The bed**: listen to 2–3 candidate loops I prepare (CC0 / licensed, kitchen clatter + murmur, no words), pick
   one, approve the licence file. Optionally a second Twilio test number ($1.15/mo) on the demo store so his live line
   flips only when he is ready — otherwise the pilot happens on his line at a quiet hour.
4. Nothing new on Twilio: Media Streams needs no addendum. If we choose the REST-redirect transfer variant later,
   `FFOS_TWILIO_ACCOUNT_SID` joins the auth token already on Fly.

**Testing without a real call — two tiers, matching the sim's free/paid split:**
- **Free, in `npm test`:** `mulaw.ts` (encode/decode round-trip against the G.711 tables), `mixer.ts` (gain, duck
  ramps, limiter, bed loop seam), `pacer.ts` (frame cadence + lead under a fake clock), `heard.ts` (alignment →
  prefix), the barge-in policy, the greeting cache key. `SttProvider` / `TtsProvider` are interfaces
  (`stt/deepgram.ts`, `tts/elevenlabs.ts` real; `FakeStt` emits scripted transcripts/interims at scripted times,
  `FakeTts` renders each text as a tone of length ∝ chars with synthetic alignment) — so `runScenario` in
  `src/lib/voice/sim/harness.ts` gets a `transport: "media"` option that drives `MediaSession` (fake Twilio, fake
  providers, real `CallSession`) and the 35 scenarios exercise the adapter's turn logic with real timing (early
  fragments etc. included; the harness keeps `earlyFragmentMs: 0` for the CR transport as now).
- **Paid, on demand:** `scripts/nabil-audio-loopback.ts` — a fake Twilio that connects to a local `/media`, sends
  `connected/start`, streams a caller WAV (8 kHz µ-law fixtures under `src/lib/voice/sim/audio-fixtures/`, made once
  from TTS or a recording) paced at 20 ms, records every outbound frame to `out.wav`, and prints: first-audio latency,
  barge-in cut latency (it interrupts at a scripted time), bed RMS in dBFS during silence vs. under speech, chars sent
  to ElevenLabs, Deepgram seconds. Real Deepgram + ElevenLabs keys, cents per run. `npm run nabil:release` gains an
  `--audio` step that runs the fake-provider media suite always and the loopback when keys are present.

---

## 6. Phased build, effort, order that keeps prod safe

| Phase | What | Effort |
|---|---|---|
| **0 — Spike** (feature-flagged, demo store or Luigi's line at a quiet hour) | Throwaway `/media` handler that echoes the bed + one cached sentence: verify `<Connect action>` fires for `<Stream>` (and for a refused socket), `<Redirect>` fallback, `dtmf` events, `mark` round-trip, frame cadence + base64/JSON CPU per call on shared-cpu-1x, no-connect ⇒ store rings. Write findings into this doc. | 1 day |
| **1 — Audio core, no telephony** | `services/nabil-voice/src/media/{mulaw,bed,mixer,pacer,heard,media-session}.ts`, `stt/deepgram.ts`, `tts/elevenlabs.ts` (+ fakes), `server.ts` `/media`, `config.ts` secrets (optional by design — the service must boot without them, like the fallback secrets), greeting/filler cache, `shutdownTransfer` via the adapter, new events; unit tests; loopback script. | 2–3 days |
| **2 — App side** | Schema `audioPipeline` (+ `handoffReason`) on both branches; TwiML builders + kill switch + breaker; token fields; `after-stream` route + shared `handoff-twiml.ts`; context payload (`sttHints`, `ambientNoise`, voice fields); `EVENT_TYPES` + i18n ×38; versions/usage columns; Nabil Phone Lines pipeline flip; Settings ambience toggle un-"coming-soon" (visible only on `mediastreams`); COSTS.md rows; README/OWNER-ACTIONS. Preflight + parity 0/0/0/0. | 1 day |
| **3 — Pilot on Luigi's line** | Flip his store; his test-call script; tune endpointing / barge-in thresholds / bed gain on a real handset and a speakerphone; measure ¢/min from the new counters; fix; release gate 3/3 (`--audio`) → Fly deploy both machines. | 1–2 days |
| **4 — GA** | Default stays `conversationrelay`; flip stores one at a time from Nabil Phone Lines; marketing copy mentions ambience only after this. | 0.5 day |

**Total ≈ 6–8 working days.** Order of safety: everything behind `audioPipeline` (default off) + the env kill switch;
Vercel before Fly (additive contract); Luigi's line only until the gate is green three times; ConversationRelay never
removed.

**Risks and mitigations**
1. **Latency** (+0.2–0.4 s first audio vs. token mode): sentence-mode parity, cached greeting/fillers, TTS WS opened
   under TTFT, Flux eager end-of-turn later; measure `ttfaMs` before/after on the same scenarios.
2. **Echo / false barge-ins with the bed playing** (no AEC on Media Streams; speakerphones leak our audio back):
   ≥2-word gate, backchannel list, own-speech echo guard, energy floor above the bed's expected echo, protected
   windows unchanged; a bed with no words. Tune on the pilot; the timeline's `barge_in` events show every decision.
3. **Provider dependency in the request path** (Deepgram, ElevenLabs outages/quotas/concurrency): early-failure
   fallback to ConversationRelay per call, circuit breaker per store, `/health` provider status, quota alert at 80 %,
   Pro tier before multi-store peak.
4. **Deepgram billed for the whole call** (always-on audio is required for barge-in): 0.77¢/min — accepted; already
   in the table.
5. **Fly CPU** (100 small WS messages/s per call + mixing; today 1.06 MB RSS/call, memory not the limit): one shared
   ticker, table-driven µ-law, no per-frame allocations; extend `scripts/nabil-capacity.ts` with `--audio`; step to
   `shared-cpu-2x` if >60 % CPU at 10 calls; the 25-call cap stays.
6. **Transfer semantics** (`action` on `<Stream>`, no `HandoffData`): the intent record + `<Redirect>` belt-and-braces,
   verified in Phase 0.
7. **Twilio outbound buffering** (audio faster than real time would break "heard" accounting and barge-in): the pacer's
   ≤200 ms lead is a hard rule; `mark` echoes are the check.

---

## 7. Open questions for Luigi

1. **Which bed** — pizzeria kitchen (clatter, oven, murmur) or dining room (murmur, cutlery)? I'll bring 2–3 clips.
2. **Bed volume** — default −20 dB under the voice, ducked another 3 dB while Nabil speaks; try −18 / −22 on a real
   handset during the pilot and pick.
3. **Continuous or only under speech?** Recommendation: continuous (it also covers Nabil's thinking pauses); confirm.
4. **Bed during transfer hold** — not possible in v1 (Twilio's `<Dial>` owns the leg; the caller hears normal ringing,
   which is what "let me put you through" sounds like anyway). OK to leave?
5. **Privacy** — opt out of Deepgram's model-improvement program (slightly higher rate) and add Deepgram + ElevenLabs to
   the privacy policy's processor list — yes?
6. **ElevenLabs tier** — Creator ($22) for the pilot, Pro ($99) at ~3 stores; you buy, I say when.
7. **Test on your live line at a quiet hour, or a second test number on the demo store ($1.15/mo)?**
