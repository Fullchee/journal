// Lives apart from index.ts: workerd turns every named export of the Worker's main module into an entrypoint and refuses a string.

/** wrangler.jsonc's cron for the Evening review's next-morning pass; it runs alone because the Hevy sync spends most of a run's subrequests. */
export const EVENING_REVIEW_CRON = "47 8 * * *";

/** wrangler.jsonc's daily Hevy sync, off the hour as Hevy asks. */
export const HEVY_SYNC_CRON = "23 7 * * *";
