import { apiRequest } from "./trackerData";
import { requireSupabase } from "./supabase";
jest.mock("./supabase", () => ({ requireSupabase: jest.fn() }));
let client, queries, records;
beforeEach(() => {
  queries = []; records = {};
  client = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "parent", email: "parent@example.com" } }, error: null }),
      signUp: jest.fn(), signInWithPassword: jest.fn() },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    from: jest.fn((table) => {
      const query = { table, calls: [] };
      queries.push(query);
      for (const method of ["select","eq","order","range","gte","lte","limit","single","insert","upsert","update","delete","abortSignal"]) {
        query[method] = (...args) => { query.calls.push([method, ...args]); return query; };
      }
      query.then = (resolve, reject) => {
        let data = records[table] || [];
        const range = query.calls.find(([method]) => method === "range");
        if (range) data = data.slice(range[1], range[2] + 1);
        if (query.calls.some(([method]) => method === "limit")) data = data.slice(0, 1);
        if (query.calls.some(([method]) => method === "single")) data = data[0] || {};
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      };
      return query;
    }),
  };
  requireSupabase.mockReturnValue(client);
});
test("day reads are baby-scoped and retain the existing milk and breastfeeding UI shape", async () => {
  records.tracker_milk_entries = [{ id: "milk", amount: 80, date: "2026-10-03" }];
  records.tracker_breastfeeding_logs = [{ id: "feed", created_at: "2026-10-03T12:00:00Z" }];
  const day = await apiRequest("/days/2026-10-03", { babyId: "baby" });
  expect(day.entries[0].amount).toBe(80);
  expect(day.breastfeeding_logs[0]).not.toHaveProperty("amount");
  expect(day.goal).toBeNull();
  for (const query of queries) expect(query.calls).toContainEqual(["eq", "baby_id", "baby"]);
});
test("breastfeeding insert leaves timestamp and author to database defaults", async () => {
  await apiRequest("/breastfeeding", { babyId: "baby", method: "POST", body: { date: "2026-10-03" } });
  expect(queries[0].calls).toContainEqual(["insert", { baby_id: "baby", date: "2026-10-03" }]);
});
test("deletes include the baby and record ID", async () => {
  await apiRequest("/entries/record", { babyId: "baby", method: "DELETE" });
  expect(queries[0].calls).toEqual(expect.arrayContaining([["eq", "baby_id", "baby"], ["eq", "id", "record"]]));
});
test("all-record exports page past response limits", async () => {
  records.tracker_milk_entries = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), date: "2026-10-03", amount: 80 }));
  records.tracker_babies = [{ id: "baby", name: "Baby" }];
  const blob = await apiRequest("/exports?format=json", { babyId: "baby" });
  const text = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });
  expect(JSON.parse(text).milk_entries).toHaveLength(1001);
  expect(queries.filter((query) => query.table === "tracker_milk_entries")).toHaveLength(3);
});
test("signup without a session asks for confirmation without querying private data", async () => {
  client.auth.signUp.mockResolvedValue({ data: { user: { id: "parent" }, session: null }, error: null });
  expect(await apiRequest("/auth/register", { body: { email: "parent@example.com", password: "testpass" } })).toEqual({ confirmation_required: true });
  expect(client.from).not.toHaveBeenCalled();
});
test("temporary Auth network errors do not become logout errors", async () => {
  client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "Offline", status: 503 } });
  await expect(apiRequest("/me")).rejects.toMatchObject({ message: "Offline" });
  try { await apiRequest("/me"); } catch (err) { expect(err.status).toBeUndefined(); }
});
