import * as z from "zod/mini";

const MAX_OBSTACLES = 20;
export const MAX_OBSTACLE = 50;

const Obstacle = z.string().check(z.refine((o) => o.trim().length <= MAX_OBSTACLE));

export const Obstacles = z.array(Obstacle).check(z.maxLength(MAX_OBSTACLES));

export function normalizeObstacles(obstacles: string[]) {
  const normalized = new Set<string>();

  for (const obstacle of obstacles) {
    const name = obstacle.trim().toLowerCase();

    if (name !== "") normalized.add(name);
  }

  return [...normalized];
}
