import {
  queryOptions,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import * as z from "zod/mini";

import {
  Connection,
  ConnectionMatch,
  ConnectionsBody,
  Interaction,
  InteractionKind,
  torontoDay,
  type ConnectionDate,
  type Meetup,
} from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";
import {
  CAPTURE_SCOPE,
  describeCaptures,
  unsentVariables,
  type CaptureKind,
} from "@/lib/data/captures";

/** What "Reached out" or an edit saves; only an in-person Interaction holds minutes. */
const InteractionFields = z.object({
  kind: InteractionKind,
  note: z.string(),
  minutes: z.nullable(z.number()),
});

export type InteractionFields = z.infer<typeof InteractionFields>;

/** A queued Interaction; `requestId` lets the server drop a replay. */
const LoggedInteraction = z.extend(InteractionFields, {
  connectionIds: z.array(z.number()),
  day: z.string(),
  requestId: z.string(),
});

type LoggedInteraction = z.infer<typeof LoggedInteraction>;

/** The detail API adds the Markdown notes; `title` lets journal's shared Note view render them. */
const ConnectionDetail = z.extend(Connection, {
  body: z.string(),
  title: z.string(),
  interactions: z.array(Interaction),
});

export type ConnectionDetail = z.infer<typeof ConnectionDetail>;

export const ConnectionDetailBody = z.object({ item: ConnectionDetail });

export type ConnectionDetailBody = z.infer<typeof ConnectionDetailBody>;

const CreatedConnection = z.object({ id: z.number() });

const ConnectionSearchBody = z.object({ found: z.array(ConnectionMatch) });

/** A link as the form edits and saves it: the other person's id and the label. */
export interface LinkDraft {
  id: number;
  label: string;
}

/** The fields the edit form holds; saving sends them whole. */
export type ConnectionDraft = Pick<
  Connection,
  | "name"
  | "closeness"
  | "circles"
  | "cadenceDays"
  | "followUps"
  | "howWeMet"
  | "growCloser"
  | "contactId"
> & { meetups: Meetup[]; dates: ConnectionDate[]; metThroughId: number | null; links: LinkDraft[] };

/** What the new-person form sends: a typed name, or a picked contact's name, birthday and id. */
export type NewConnection = Pick<ConnectionDraft, "name" | "dates" | "contactId">;

const LOG_INTERACTION: CaptureKind<LoggedInteraction> = {
  key: ["interactions", "log"],
  variables: LoggedInteraction,
};

const CONNECTIONS_KEY = ["connections"];

/** Lays unsent Interactions over people, so a reach-out shows until the server has it. */
export function withLoggedInteractions<C extends Connection>(
  connections: C[],
  logged: LoggedInteraction[],
): C[] {
  return connections.map((connection) => {
    let newest = connection.lastContactedOn;

    for (const { connectionIds, day } of logged)
      if (connectionIds.includes(connection.id) && (newest === null || day > newest)) newest = day;

    return newest === connection.lastContactedOn
      ? connection
      : { ...connection, lastContactedOn: newest };
  });
}

export const connectionsQuery = queryOptions({
  queryKey: CONNECTIONS_KEY,
  queryFn: async ({ client, signal }) => {
    const { connections } = await apiFetch("/api/connections", { signal }, ConnectionsBody);

    return {
      connections: withLoggedInteractions(connections, unsentVariables(client, LOG_INTERACTION)),
    };
  },
  meta: { persist: true },
});

/** Cached as the server sent it; `useConnection` lays unsent reach-outs over it. */
export const connectionQuery = (id: number) =>
  queryOptions({
    queryKey: ["connections", "detail", id],
    queryFn: ({ signal }) => apiFetch(`/api/connections/${id}`, { signal }, ConnectionDetailBody),
    meta: { persist: true },
  });

/**
 * Searches names, notes, follow-ups, how we met, Interaction notes, meetup and date labels on the server, where the notes live.
 */
const connectionSearchQuery = (q: string) =>
  queryOptions({
    queryKey: ["connections", "search", q],
    queryFn: async ({ signal }) => {
      const { found } = await apiFetch(
        `/api/connections?${new URLSearchParams({ q })}`,
        { signal },
        ConnectionSearchBody,
      );

      return found;
    },
  });

const saveInteraction = (logged: LoggedInteraction) =>
  apiFetch("/api/interactions", { method: "POST", body: logged });

export function registerConnectionCaptures(client: QueryClient) {
  client.setMutationDefaults(LOG_INTERACTION.key, {
    scope: CAPTURE_SCOPE,
    mutationFn: saveInteraction,
    onMutate: async () => {
      await client.cancelQueries({ queryKey: connectionsQuery.queryKey, exact: true });
      client.setQueryData<ConnectionsBody>(
        connectionsQuery.queryKey,
        (body) =>
          body && {
            connections: withLoggedInteractions(
              body.connections,
              unsentVariables(client, LOG_INTERACTION),
            ),
          },
      );
    },
    // Awaited, so a detail keeps its overlay until the refetch brings the saved Interaction.
    onSettled: () => client.invalidateQueries({ queryKey: CONNECTIONS_KEY }),
  });

  describeCaptures(LOG_INTERACTION, ({ note }) =>
    note === "" ? `"reached out"` : `"reached out": ${note}`,
  );
}

export const useConnections = () => useQuery(connectionsQuery);

export function useConnection(id: number) {
  const query = useQuery(connectionQuery(id));

  const logged = useMutationState({
    filters: { mutationKey: LOG_INTERACTION.key, status: "pending" },
    select: (mutation) => LOG_INTERACTION.variables.safeParse(mutation.state.variables).data,
  }).filter((interaction) => interaction !== undefined);

  return {
    ...query,
    connection: query.data && withLoggedInteractions([query.data.item], logged)[0],
  };
}

export const useConnectionSearch = (q: string) =>
  useQuery({ ...connectionSearchQuery(q), enabled: q !== "" });

/** Queued: logs an Interaction on today's Toronto Day, shows at once and saves when online. */
export function useLogInteraction() {
  const { mutate } = useMutation<unknown, Error, LoggedInteraction>({
    mutationKey: LOG_INTERACTION.key,
  });

  return (connectionIds: number[], fields: InteractionFields) =>
    mutate({ ...fields, connectionIds, day: torontoDay(new Date()), requestId: randomUUID() });
}

/** Online only: an Interaction's day, kind, note and minutes. */
export function useEditInteraction() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, edit }: { id: number; edit: InteractionFields & { day: string } }) =>
      apiFetch(`/api/interactions/${id}`, { method: "PATCH", body: edit }),
    onSuccess: () => client.invalidateQueries({ queryKey: CONNECTIONS_KEY }),
  });
}

/** Online only. */
export function useDeleteInteraction() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => apiFetch(`/api/interactions/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: CONNECTIONS_KEY }),
  });
}

/** Online only: a name already taken answers 409. */
export function useCreateConnection() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (person: NewConnection) =>
      apiFetch("/api/connections", { method: "POST", body: person }, CreatedConnection),
    onSuccess: () => client.invalidateQueries({ queryKey: CONNECTIONS_KEY }),
  });
}

/** Online only: field edits and Grow closer answers; the server answers with the saved person. */
export function useUpdateConnection() {
  type ConnectionPatch = Partial<ConnectionDraft> & { planChecked?: true };

  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ConnectionPatch }) =>
      apiFetch(`/api/connections/${id}`, { method: "PATCH", body: patch }, ConnectionDetailBody),
    onSuccess: (saved) => {
      client.setQueryData(connectionQuery(saved.item.id).queryKey, saved);

      return client.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    },
  });
}

/** Online only: replaces the Markdown notes. */
export function useSaveConnectionNotes(id: number) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: string) =>
      apiFetch(`/api/connections/${id}`, { method: "PUT", body: { body } }, ConnectionDetailBody),
    onSuccess: (saved) => client.setQueryData(connectionQuery(id).queryKey, saved),
  });
}
