import { createClient } from "@supabase/supabase-js";
const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export const googleEnabled = process.env.REACT_APP_GOOGLE_LOGIN === "true";
export function requireSupabase() {
  if (!supabase) throw new Error("Supabase isn't configured yet. Add the project URL and publishable key to frontend/.env.local, then restart the app.");
  return supabase;
}
export async function restoreSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
export function watchSession(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}
