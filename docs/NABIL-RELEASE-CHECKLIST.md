# Nabil AI — release checklist (the safe lane)

Luigi's rule (2026-08-22): **nothing may affect the live store while we fix things; every change is tested before it goes live; any fix can be reverted in one step.**

Two lanes, one image:

| Lane | Fly app | Phone numbers | Who calls it |
|---|---|---|---|
| **staging** | `nabil-voice-staging` (`services/nabil-voice/fly.staging.toml`) | `VoiceNumber.voiceChannel = "staging"` (superadmin › Nabil Phone Lines) | Luigi + the platform team only |
| **current** (live) | `nabil-voice` (`fly.toml`) | every other number | real customers |

The Vercel app is shared by both lanes. A Vercel change that alters what a live caller experiences sits behind a **channel feature flag** (`src/lib/voice/feature-flags.ts`): staging always has every flag on; the live lane only the names in `NABIL_FLAGS_CURRENT`. Promotion of such a change = adding the flag name to that env var; rollback = removing it. Purely additive work (new routes, side tables, retries, telemetry) needs no flag.

## Per change

1. **Branch + tests** — `npx vitest run src/lib/voice` (incl. the engine tier, 374 exact) and `npm run typecheck:voice`.
2. **Sim gate** — `npx tsx scripts/nabil-release.ts --target staging` runs typecheck → vitest → critical + injection sims (repeat 3) → cost + naturalness gates, then deploys to **staging** with the git sha baked in as `agentVersion`. No manual "GO" annotations, ever.
3. **Staging calls** — at least **three real phone calls on the staging line** covering the changed behaviour; Luigi listens to anything audible (voice, fillers, read-backs). `curl https://nabil-voice-staging.fly.dev/health` must show `channel=staging agent=<sha>` first.
4. **Numbers, not impressions** — compare the staging calls' evaluator scores (dead-air turns, stuck transfers, clarifications, cart-vs-order, TTFA) against the live lane for the same period. Staging must be ≥ live on every category it touches.
5. **Promote** — `npx tsx scripts/nabil-release.ts --target current --image <the staging image ref> --skip-sim` deploys the **same image** to the live app (no rebuild). Flip any Vercel flags by adding them to `NABIL_FLAGS_CURRENT`. Write the previous live image ref in the HISTORY.md row *before* promoting — that is the rollback target.
6. **Watch** — the first 20 live calls (call quality alert + the Calls tab). Anything worse → step 7 immediately.
7. **Rollback** — `npx tsx scripts/nabil-release.ts --target current --image <previous image ref> --skip-sim` (about two minutes, no code change) and/or remove the flag names from `NABIL_FLAGS_CURRENT`.

## Always true

- The public line's `voiceChannel` stays `current`. The Phone Lines page confirms before moving any number to staging and refuses when the deployment has no `NABIL_VOICE_STAGING_WSS_URL`.
- A call token carries the lane it was minted for (`ch`); each Fly app refuses tokens for the other lane, so a mis-pointed URL is loud, not silent.
- If Nabil is off (`VoiceAgentConfig.enabled=false`) or the service is unreachable, the existing safety net rings the store phone directly — unchanged by any of this.
- Vercel deploys before Fly; contracts stay additive in both directions.
- Stage explicit paths only (`git add <paths>`); other Claude sessions share the tree.
