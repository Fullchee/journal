// Jest runs each suite in a vm realm, but Node's fetch classes parse JSON in the outer realm, whose
// arrays and objects fail node:assert's strict prototype check; parsing here keeps bodies in the test realm.
for (const Body of [Request, Response]) {
  Body.prototype.json = async function json(this: Body) {
    // SAFETY: Body#json is typed `Promise<any>`; `unknown` is the honest type of parsed JSON.
    return JSON.parse(await this.text()) as unknown;
  };
}
