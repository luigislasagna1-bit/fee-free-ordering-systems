# Nabil AI voice service — runs on Fly.io (NOT Vercel; Vercel can't hold a WebSocket).
FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

# The build this image was made from — stamped on every call record as
# `agentVersion` so a behaviour change can be tied to a release (directive §27).
# `scripts/nabil-release.ts` passes the git SHA: fly deploy --build-arg AGENT_VERSION=<sha>
# Empty by default (A3): an unset stamp falls through to FLY_IMAGE_REF in
# versions.ts instead of masking it with "dev".
ARG AGENT_VERSION=
ENV NABIL_AGENT_VERSION=$AGENT_VERSION

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# ⚠️ node must be the container's MAIN process — never `npm start`.
# 2026-08-16 19:28Z (a `fly secrets deploy`): Fly sent SIGTERM to `npm`, npm
# died in the same second ("Main child exited with signal 'SIGTERM'"), the
# machine went down with it, and the graceful drain in server.ts (SIGTERM →
# stop accepting → wait for live calls → warm-transfer → exit 0) never ran — a
# call that started 33 s earlier lost its WebSocket and its end record. With
# node as PID 1's child the handler receives the signal directly and Fly's
# kill_timeout (5m) gives it room to finish. `--import tsx` runs the TS
# sources in-process (no relay wrapper). Verify after any change: restart one
# machine and expect "[nabil-voice] SIGTERM: draining, N live call(s)" then
# "Main child exited normally with code 0" in `fly logs`.
CMD ["node", "--import", "tsx", "src/server.ts"]
