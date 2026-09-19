import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isLocalMode } from "@/lib/runtime";

/**
 * Destino del enlace de acceso.
 *
 * Supabase manda uno de dos formatos según la configuración del proyecto:
 *   ?code=...        flujo PKCE  → exchangeCodeForSession
 *   ?token_hash=...  flujo OTP   → verifyOtp
 * Se aceptan los dos: cuál llega depende de la instancia, no del código.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  if (isLocalMode()) return NextResponse.redirect(`${origin}/`);
  const supabase = await supabaseServer();

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
    console.error("[auth] exchangeCodeForSession", error.message);
  }

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}/`);
    console.error("[auth] verifyOtp", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
