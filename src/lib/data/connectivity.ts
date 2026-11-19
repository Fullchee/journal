function stopWatching() {
  // Nothing to stop: the browser's events were never ours.
}

/** Web: TanStack Query already listens to the browser's online and focus events. */
export const watchConnectivity = () => stopWatching;
