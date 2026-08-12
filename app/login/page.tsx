"use client";

import { FormEvent, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSending(true);
    setMessage("");
    setErrorMessage("");

    const { error } = await browserSupabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setMessage("Check your email for a secure sign-in link.");
    }

    setIsSending(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 text-slate-900">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-medium text-sky-600">Water Tracker</p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Sign in
        </h1>

        <p className="mt-3 text-slate-600">
          Enter your owner email to receive a secure magic link.
        </p>

        <form className="mt-6 space-y-4" onSubmit={sendMagicLink}>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Email address
            </span>

            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="you@example.com"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </label>

          <button
            type="submit"
            disabled={isSending}
            className="w-full rounded-xl bg-sky-600 px-4 py-3 font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? "Sending link..." : "Email me a sign-in link"}
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {message}
          </p>
        )}

        {errorMessage && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage}
          </p>
        )}
      </section>
    </main>
  );
}