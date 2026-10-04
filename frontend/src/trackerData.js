import { requireSupabase } from "./supabase";
const TYPES = ["milk_entries", "pee_logs", "poop_logs", "breastfeeding_logs", "daily_goals", "measurements"];
const ENDPOINTS = { entries: "milk_entries", pee: "pee_logs", poop: "poop_logs", breastfeeding: "breastfeeding_logs", goals: "daily_goals", measurements: "measurements" };
async function result(query, signal) {
  const { data, error } = await (signal && query.abortSignal ? query.abortSignal(signal) : query);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (error) { const err = new Error(error.message || "Please try again."); if (error.code === "PGRST301" || error.status === 401) err.status = 401; throw err; }
  return data;
}
async function profile(client, signal) {
  const { data: { user }, error } = await client.auth.getUser();
  if (error) { const err = new Error(error.message); if ([401,403].includes(error.status) || error.name === "AuthSessionMissingError") err.status = 401; throw err; }
  if (!user) { const err = new Error("Please sign in again."); err.status = 401; throw err; }
  await result(client.rpc("tracker_initialize"), signal);
  const [babies, households, preferences] = await Promise.all([
    result(client.from("tracker_babies").select("*").order("created_at"), signal),
    result(client.from("tracker_households").select("*").order("created_at"), signal),
    result(client.from("tracker_preferences").select("milk_amounts").eq("user_id", user.id).single(), signal),
  ]);
  return { user: { id: user.id, email: user.email }, babies, households, milk_amounts: preferences.milk_amounts };
}
// Existing screens use this adapter; every operation goes directly to Supabase.
export async function apiRequest(path, { babyId, method = "GET", body, signal } = {}) {
  const client = requireSupabase();
  const url = new URL(path, "https://tracker.local");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "auth") {
    if (parts[1] === "logout") { await result(client.auth.signOut()); return {}; }
    if (parts[1] === "reset") { await result(client.auth.resetPasswordForEmail(body.email, { redirectTo: window.location.href })); return {}; }
    if (parts[1] === "password") { await result(client.auth.updateUser({ password: body.password })); return {}; }
    if (parts[1] === "google") return result(client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } }));
    const data = await result(parts[1] === "register" ? client.auth.signUp({ ...body, options: { emailRedirectTo: window.location.href } }) : client.auth.signInWithPassword(body));
    if (!data.session) return { confirmation_required: true };
    return { ...(await profile(client, signal)), token: data.session.access_token };
  }
  if (parts[0] === "me") {
    if (parts[1] !== "preferences") return profile(client, signal);
    if (method === "GET") return { milk_amounts: (await profile(client, signal)).milk_amounts };
    const { data: { user } } = await client.auth.getUser();
    return result(client.from("tracker_preferences").update({ milk_amounts: body.milk_amounts }).eq("user_id", user.id).select("milk_amounts").single(), signal);
  }
  if (parts[0] === "invites") {
    const data = await result(client.rpc(parts[2] === "accept" ? "tracker_accept_invite" : "tracker_preview_invite", { invite_token: parts[1] }), signal);
    return parts[2] === "accept" ? { ...(await profile(client, signal)), accepted_household_id: data } : data;
  }
  if (parts[0] === "households") {
    if (parts[2] === "setup") return result(client.rpc("tracker_complete_setup", {
      target_household: parts[1], target_baby: body.baby_id,
      household_name: body.household_name, baby_name: body.baby_name,
    }), signal);
    if (parts[2] === "members") return { members: await result(client.rpc("tracker_members", { target_household: parts[1] }), signal) };
    if (parts[2] === "invites") return result(client.rpc("tracker_create_invite", { target_household: parts[1], target_email: body.invited_email || null }), signal);
    return { household: await result(client.from("tracker_households").update({ name: body.name.trim() }).eq("id", parts[1]).select().single(), signal) };
  }
  if (parts[0] === "babies") {
    const query = parts[1] ? client.from("tracker_babies").update({ name: body.name.trim() }).eq("id", parts[1]) : client.from("tracker_babies").insert({ name: body.name.trim(), household_id: body.household_id });
    return { baby: await result(query.select().single(), signal) };
  }
  if (!babyId) throw new Error("Choose a baby first.");
  const scoped = (type) => client.from(`tracker_${type}`).select("*").eq("baby_id", babyId);
  if (parts[0] === "days") {
    const records = await Promise.all(TYPES.map((type) => result(scoped(type).eq("date", parts[1]).order("created_at"), signal)));
    const day = Object.fromEntries(TYPES.map((type, i) => [type, records[i]]));
    return { ...day, entries: day.milk_entries.map((row) => ({ ...row, amount: Number(row.amount) })), goal: day.daily_goals[0]?.goal ?? null, measurement: day.measurements[0] || null };
  }
  if (parts[0] === "history" || parts[0] === "exports") {
    const start = url.searchParams.get("start_date"), end = url.searchParams.get("end_date");
    if ((start || end) && (!start || !end || start > end)) throw new Error("Choose a valid date range.");
    const records = await Promise.all(TYPES.map(async (type) => {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        let query = scoped(type).order("date").order("id").range(offset, offset + 499);
        if (start) query = query.gte("date", start).lte("date", end);
        const page = await result(query, signal); rows.push(...page);
        if (page.length < 500) return rows;
      }
    }));
    if (parts[0] === "history") {
      const days = {};
      TYPES.forEach((type, i) => records[i].forEach((row) => {
        const day = days[row.date] ||= { date: row.date, milk_ml: 0, ...Object.fromEntries(TYPES.map((key) => [key, 0])) };
        day[type] += 1; if (type === "milk_entries") day.milk_ml += Number(row.amount);
      }));
      const firsts = await Promise.all(TYPES.map((type) => result(scoped(type).order("date").limit(1), signal)));
      return { days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)), earliest_date: firsts.flat().map((row) => row.date).sort()[0] || null };
    }
    const baby = await result(client.from("tracker_babies").select("id,name").eq("id", babyId).single(), signal);
    const data = { version: 1, exported_at: new Date().toISOString(), baby, start_date: start, end_date: end, ...Object.fromEntries(TYPES.map((type, i) => [type, records[i]])) };
    if (url.searchParams.get("format") === "json") return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = TYPES.flatMap((type, i) => records[i].map((row) => ({ ...row, type }))).sort((a, b) => `${a.date}${a.created_at}`.localeCompare(`${b.date}${b.created_at}`));
    const lines = rows.map((row) => {
      let notes = row.notes || "";
      if (/^[\s]*[=+@-]|^[\t\r\n]/.test(notes)) notes = `'${notes}`;
      return [row.date, row.type, row.amount, notes, row.created_at, row.goal, row.weight, row.height].map(escape).join(",");
    });
    return new Blob(["\uFEFFdate,type,amount_ml,notes,created_at,goal_ml,weight_kg,height_cm\r\n", lines.join("\r\n")], { type: "text/csv" });
  }
  const type = ENDPOINTS[parts[0]];
  if (!type) throw new Error("Unsupported tracker operation.");
  const table = client.from(`tracker_${type}`);
  if (method === "DELETE") return result(table.delete().eq("baby_id", babyId).eq("id", parts[1]).select().single(), signal);
  if (method === "PUT") return result(table.update(body).eq("baby_id", babyId).eq("id", parts[1]).select().single(), signal);
  const values = { ...body, baby_id: babyId };
  const query = ["daily_goals", "measurements"].includes(type) ? table.upsert(values, { onConflict: "baby_id,date" }) : table.insert(values);
  return result(query.select().single(), signal);
}
