/**
 * Cloudflare Worker — cron-triggered GitHub Actions dispatcher.
 *
 * Runs on a Cloudflare Cron Trigger (see wrangler.toml). On each scheduled
 * fire it calls the GitHub workflow_dispatch API to trigger the
 * "Daily News Build" workflow on main. The heavy lifting (fetch → commit →
 * build → deploy) stays in GitHub Actions; this worker only fires the trigger,
 * so it stays tiny and reliable.
 *
 * Required secret: GH_TOKEN — a GitHub fine-grained PAT with
 * "Actions: Read and write" on this repo.
 */

interface Env {
  GH_TOKEN: string;
}

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const REPO = 'chunyang4015/Ai-Daily-News';
const WORKFLOW_ID = 'daily-build.yml';
const REF = 'main';

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const url = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ai-daily-news-cron',
      },
      body: JSON.stringify({ ref: REF }),
    });

    // GitHub returns 204 No Content on a successful dispatch.
    if (res.status !== 204) {
      const detail = await res.text();
      throw new Error(`GitHub dispatch failed: ${res.status} ${detail}`);
    }

    console.log(`Dispatched ${WORKFLOW_ID} on ${REPO}@${REF}`);
  },
};
