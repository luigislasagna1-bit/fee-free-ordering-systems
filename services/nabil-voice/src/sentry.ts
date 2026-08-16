/**
 * The ONLY file that imports @sentry/node. Imported first by server.ts.
 *
 * `./config` is imported before Sentry so a missing REQUIRED env var still dies
 * exactly as before (loudly, in `fly logs`) — nothing here can swallow that.
 * With no SENTRY_DSN nothing is initialised; the process handlers are installed
 * either way so crash behaviour never depends on an optional secret.
 *
 * Zero overhead on the streaming turn loop: default integrations OFF (the Node
 * SDK otherwise auto-instruments http/fetch/ws through OpenTelemetry), no ESM
 * loader hooks (tsx + ESM), no tracing, no breadcrumbs. Errors only.
 */
import { CONFIG } from "./config";
import * as Sentry from "@sentry/node";
import { installProcessHandlers, redactDeep, redactEvent, setErrorSink } from "./observability";

const release = `nabil-voice@${process.env.NABIL_AGENT_VERSION || "dev"}`;

if (CONFIG.sentryDsn) {
  Sentry.init({
    dsn: CONFIG.sentryDsn,
    environment: "nabil-voice",
    release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    defaultIntegrations: false,
    registerEsmLoaderHooks: false,
    beforeSend: (event) => redactEvent(event),
  });
  setErrorSink({
    capture: (err, ctx) => {
      Sentry.captureException(err, {
        level: ctx?.level ?? "error",
        tags: {
          where: ctx?.where ?? "unknown",
          ...(ctx?.callSid ? { callSid: ctx.callSid } : {}),
          ...(ctx?.restaurantId ? { restaurantId: ctx.restaurantId } : {}),
          ...(ctx?.orderNumber ? { orderNumber: ctx.orderNumber } : {}),
        },
        extra: ctx?.extra ? redactDeep(ctx.extra) : undefined,
      });
    },
    flush: (ms) => Sentry.flush(ms),
  });
  console.log(`[nabil-voice] Sentry on (${release}, environment nabil-voice)`);
} else {
  console.log("[nabil-voice] Sentry off — SENTRY_DSN not set (errors still go to stdout)");
}

installProcessHandlers();
