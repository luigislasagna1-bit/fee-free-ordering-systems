# Nabil AI voice service — runs on Fly.io (NOT Vercel; Vercel can't hold a WebSocket).
FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
