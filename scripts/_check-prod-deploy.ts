/** Read-only: which git SHA is currently live on the Vercel production
 *  deployment? Confirms a push actually shipped before we act on it. */
import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });

async function main() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId) {
    console.log("VERCEL_TOKEN / VERCEL_PROJECT_ID not set locally — skipping API check");
    return;
  }
  const q = new URLSearchParams({ projectId, limit: "5", target: "production" });
  if (teamId) q.set("teamId", teamId);
  const res = await fetch(`https://api.vercel.com/v6/deployments?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    console.log(`Vercel API error ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
    return;
  }
  for (const d of (data.deployments ?? []).slice(0, 5)) {
    const sha = (d.meta?.githubCommitSha ?? "").slice(0, 8);
    const msg = (d.meta?.githubCommitMessage ?? "").split("\n")[0].slice(0, 60);
    const when = new Date(d.created).toISOString().slice(0, 16);
    console.log(`${d.state.padEnd(9)} ${sha} ${when}  ${msg}`);
  }
}
main();
