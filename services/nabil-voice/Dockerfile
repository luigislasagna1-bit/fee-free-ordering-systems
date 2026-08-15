# Nabil AI voice service — runs on Fly.io (NOT Vercel; Vercel can't hold a WebSocket).
FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

# The build this image was made from — stamped on every call record as
# `agentVersion` so a behaviour change can be tied to a release (directive §27).
# `scripts/nabil-release.ts` passes the git SHA: fly deploy --build-arg AGENT_VERSION=<sha>
ARG AGENT_VERSION=dev
ENV NABIL_AGENT_VERSION=$AGENT_VERSION

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
