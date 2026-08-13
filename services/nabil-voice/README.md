# Nabil AI — Voice Service

The always-on WebSocket bridge between **Twilio ConversationRelay** and **Claude** for Nabil AI (Fee Free's Automated Phone Answering System). It runs **separately from the Next.js app** because Vercel's serverless runtime can't hold a live WebSocket.

```
 PSTN caller → Twilio ConversationRelay → /api/twilio/voice (Next.js: routing+gating+greeting, mints token)
                        │
                        └── wss://<this-service>/call?t=<token>  ← Twilio connects here
                                   │  Claude Sonnet turn-loop (thinking off, streaming, tool use)
                                   └── internal HTTPS (x-internal-key) → Next.js /api/internal/voice/* + /api/orders + /api/public/reservations
```

It is a **thin orchestrator**: it never touches the database. Every read goes through the `x-internal-key`-gated `/api/internal/voice/*` endpoints and every write reuses the existing public create routes, so pricing + validation stay single-sourced (`preview==charge`; the money path is unchanged).

## Speech providers
Deepgram (transcription) and ElevenLabs (text-to-speech) are **built into Twilio ConversationRelay** — there are **no separate Deepgram/ElevenLabs accounts to create**. They're selected by the TwiML attributes (`transcriptionProvider="Deepgram"`, `ttsProvider="ElevenLabs"`), which `/api/twilio/voice` already sets, and billed through Twilio. You only need to complete **ConversationRelay onboarding** in the Twilio console (accept the Predictive & Generative AI/ML Features Addendum).

## Environment
| Var | Required | What |
|---|---|---|
| `APP_BASE_URL` | ✅ | Base URL of the Fee Free app, e.g. `https://www.feefreeordering.com` |
| `INTERNAL_API_SECRET` | ✅ | Same value as the Next.js app — gates `/api/internal/voice/*` + the `channel:"voice"` order stamp |
| `NABIL_VOICE_JWT_SECRET` | ✅ | Same value as the Next.js app — verifies the short-lived call token |
| `ANTHROPIC_API_KEY` | ✅ | Reuse the app's key (same billing) |
| `NABIL_MODEL` | — | Defaults to `claude-sonnet-5` (fast tier for low latency) |
| `PORT` | — | Defaults to `8080` |

## Deploy (Fly.io)
```bash
cd services/nabil-voice
fly launch --no-deploy            # creates the app (name: nabil-voice)
fly secrets set \
  APP_BASE_URL=https://www.feefreeordering.com \
  INTERNAL_API_SECRET=... \
  NABIL_VOICE_JWT_SECRET=... \
  ANTHROPIC_API_KEY=...
fly deploy
```

Then, in the **Next.js app** env (Vercel), set:
```
NABIL_VOICE_WSS_URL = wss://nabil-voice.fly.dev/call
NABIL_VOICE_JWT_SECRET = <same value as the service>
```
(`INTERNAL_API_SECRET` and `ANTHROPIC_API_KEY` already exist in the app.)

## Wire up a restaurant's number (Twilio console)
Phone Numbers → the Nabil number → Voice → **A CALL COMES IN**:
`Webhook  HTTP POST  https://www.feefreeordering.com/api/twilio/voice`

## Verify
- `curl https://nabil-voice.fly.dev/health` → `ok`
- Place a real call to the Nabil number; watch `fly logs`. Measure first-audio latency (target ~0.6–1.1s p50).

## Notes / follow-ups
- **Transfer to a human** needs a `<Connect action="…/api/twilio/voice/handoff">` on the TwiML + a small handoff route that `<Dial>`s the restaurant's `transferToNumber` when we send `{type:"end", handoffData}`. (Tracked.)
- Two internal endpoints this service calls are built alongside it: `POST /api/internal/voice/send-sms` (task #13) and `POST /api/internal/voice/call-log` (VoiceCall logging + AI summary/sentiment).
- `voiceSpeed` **is** applied — it rides the extended ConversationRelay `voice`
  value (`<id>-<model>-<speed>_<stability>_<similarity>`, built by
  `src/lib/voice/elevenlabs-voices.ts`), which also pins the TTS model to
  `turbo_v2_5` so audio quality is never a side effect of the speed slider.
- `ambientNoise` is still a **no-op** and is labelled "coming soon" in the UI.
  It is not a matter of finding the right attribute: ConversationRelay owns the
  media path end-to-end and this service only ever exchanges TEXT with it, so
  there is nowhere to mix a background bed in. Doing it for real means leaving
  ConversationRelay for raw Media Streams and taking over STT, TTS and barge-in
  ourselves. Do not ship a toggle that pretends otherwise.
- Local run: `npm install && APP_BASE_URL=… INTERNAL_API_SECRET=… NABIL_VOICE_JWT_SECRET=… ANTHROPIC_API_KEY=… npm start`.
