import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isLocalMode } from "@/lib/runtime";
import { cookies } from "next/headers";
import { LOCAL_SESSION_COOKIE, revokeLocalSession } from "@/lib/local/auth";

export async function POST(req: Request) {
  if (isLocalMode()) {
    const store = await cookies();
    revokeLocalSession(store.get(LOCAL_SESSION_COOKIE)?.value);
    store.delete(LOCAL_SESSION_COOKIE);
    return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  }
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
