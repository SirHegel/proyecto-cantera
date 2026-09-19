/** Local runs need no accounts or API keys; hosted deployments opt in to Supabase. */
export function isLocalMode(): boolean {
  const mode = process.env.CANTERA_MODE?.trim().toLowerCase();
  if (mode === "local") return true;
  if (mode === "supabase") return false;
  if (mode) throw new Error("CANTERA_MODE debe ser local o supabase.");
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
