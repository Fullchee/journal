/** The upcoming-alarm notice's own button, beside the ring's Done and Skip: silences today's ring without a log. */
export const DISMISS_RING_ACTION = {
  title: "Dismiss",
  pressAction: { id: "dismiss-ring" },
} as const;

export const UPCOMING_CHANNEL = "upcoming";

const PREFIX = "upcoming-";

/** One notice per ring, so a reschedule replaces it in place. */
export const upcomingId = (ringId: number) => `${PREFIX}${ringId}`;

export const isUpcomingId = (id: string) => id.startsWith(PREFIX);
