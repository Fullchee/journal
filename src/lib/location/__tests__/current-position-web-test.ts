import { currentPosition } from "@/lib/location/current-position";

it("reads no position off Android, so a Check-in saves without one", async () => {
  await expect(currentPosition()).resolves.toBeNull();
});
