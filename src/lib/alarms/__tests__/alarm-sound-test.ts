import { pickAlarmSound, useAlarmSound } from "@/lib/alarms/alarm-sound";

describe("alarm sound off Android", () => {
  it("shows no sound", () => {
    expect(useAlarmSound()).toBeNull();
  });

  it("has nothing to pick", async () => {
    await expect(pickAlarmSound()).resolves.toBeUndefined();
  });
});
