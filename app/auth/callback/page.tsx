"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    async function completeSignIn() {
      const queryParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash,
      );

      const authError =
        queryParams.get("error_description") ||
        hashParams.get("error_description");

      if (authError) {
        setMessage(
          `${authError} Return to the login page and request a new sign-in link.`,
        );
        return;
      }

      const code = queryParams.get("code");

      if (!code) {
        setMessage(
          "This sign-in link is invalid or has expired. Return to the login page and request a new link.",
        );
        return;
      }

      const { error } = await browserSupabase.auth.exchangeCodeForSession(code);

      if (error) {
        setMessage(
          `${error.message} Return to the login page and request a new sign-in link.`,
        );
        return;
      }

      router.replace("/");
    }

    completeSignIn();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 text-slate-900">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-lg font-semibold">Water Tracker</p>

        <p className="mt-4 text-slate-600">{message}</p>

        {message !== "Signing you in…" && (
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="mt-6 rounded-xl bg-sky-600 px-4 py-3 font-bold text-white transition hover:bg-sky-700"
          >
            Return to sign in
          </button>
        )}
      </section>
    </main>
  );
}