"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isLocalMode } from "@/lib/runtime";
import {
  authenticateLocalAccount,
  createLocalSession,
  LOCAL_SESSION_COOKIE,
  registerLocalAccount,
  revokeLocalSession,
  SESSION_MAX_AGE,
  LocalAuthError,
} from "@/lib/local/auth";

export async function localSignIn(formData: FormData) {
  if (!isLocalMode()) redirect("/login");
  let errorMessage: string | null = null;
  try {
    const account = await authenticateLocalAccount(
      String(formData.get("email") ?? ""),
      String(formData.get("password") ?? ""),
    );
    await saveSession(String(account.id));
  } catch (error) {
    errorMessage =
      error instanceof LocalAuthError
        ? error.message
        : "No pudimos abrir tu cuenta. Revisa que Cantera tenga permiso para guardar sus datos e inténtalo de nuevo.";
  }
  if (errorMessage) redirect(`/login?error=${encodeURIComponent(errorMessage)}`);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function localSignUp(formData: FormData) {
  if (!isLocalMode()) redirect("/login");
  let errorMessage: string | null = null;
  try {
    const account = await registerLocalAccount({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
    });
    await saveSession(String(account.id));
  } catch (error) {
    errorMessage =
      error instanceof LocalAuthError
        ? error.message
        : "No pudimos guardar tu cuenta. Revisa que Cantera tenga permiso para guardar sus datos e inténtalo de nuevo.";
  }
  if (errorMessage) redirect(`/login?mode=register&error=${encodeURIComponent(errorMessage)}`);
  revalidatePath("/", "layout");
  redirect("/");
}

async function saveSession(userId: string) {
  const store = await cookies();
  revokeLocalSession(store.get(LOCAL_SESSION_COOKIE)?.value);
  store.set(LOCAL_SESSION_COOKIE, createLocalSession(userId), {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}
