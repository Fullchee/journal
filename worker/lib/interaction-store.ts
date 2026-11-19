import { Interaction } from "@/core";
import type { Env } from "@worker/lib/env";
import * as z from "zod/mini";

const Row = z.extend(z.omit(Interaction, { connections: true }), { connections: z.string() });

const People = Interaction.shape.connections;

/** A person's Interactions, newest first, each with everyone who was there. */
export async function readInteractions(env: Env, connectionId: number): Promise<Interaction[]> {
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.day, i.kind, i.note, i.minutes, (SELECT name FROM circles WHERE circles.id = i.circle_id) AS circle,
      (SELECT json_group_array(json_object('id', c.id, 'name', c.name)) FROM (
        SELECT c.id, c.name FROM interaction_connections link JOIN connections c ON c.id = link.connection_id
        WHERE link.interaction_id = i.id ORDER BY c.name COLLATE NOCASE
      ) c) AS connections
    FROM interactions i JOIN interaction_connections ic ON ic.interaction_id = i.id
    WHERE ic.connection_id = ?
    ORDER BY i.day DESC, i.id DESC`,
  )
    .bind(connectionId)
    .all();

  return results.map((row) => {
    const { connections, ...rest } = Row.parse(row);

    return { ...rest, connections: People.parse(JSON.parse(connections)) };
  });
}
