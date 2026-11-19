import type { Connection } from "@/core/connections-view";

export const makeConnection = (overrides: Partial<Connection> = {}): Connection => ({
  id: 1,
  name: "Sam",
  closeness: "",
  circles: [],
  cadenceDays: null,
  lastContactedOn: null,
  followUps: "",
  howWeMet: "",
  metThrough: null,
  introduced: [],
  links: [],
  meetups: [],
  dates: [],
  growCloser: false,
  planCheckedAt: null,
  contactId: null,
  ...overrides,
});
