// Today's check count per Habit on the smoke-flow API; the host and the emulator share a clock.
const now = new Date();
const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  .map((n) => String(n).padStart(2, "0"))
  .join("-");
const body = json(http.get(`http://localhost:8798/api/habits?view=home&since=${today}`).body);
output.todayChecks = body.counts[today] || {};
