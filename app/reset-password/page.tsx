"use client";

import { FormEvent, useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function checkRecoverySession() {
      const {
        data: { session },
      } = await browserSupabase.auth.getSession();

      if (!session) {
        window.location.replace("/login");
        return;
      }

      if (isMounted) {
        setIsCheckingSession(false);
      }
    }

    void checkRecoverySession();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setErrorMessage("");

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    const { error } = await browserSupabase.auth.updateUser({
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    setMessage("Password updated. You can now log in with your new password.");
    setPassword("");
    setConfirmPassword("");
    setIsSubmitting(false);

    window.setTimeout(() => {
      window.location.replace("/login");
    }, 1500);
  }

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0e13] px-5 text-slate-400">
        Checking your password-reset link…
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0e13] px-5 text-slate-100">
      <section className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#111720] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
          Tally
        </p>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
          Set a new password
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-400">
          Choose a new password for your account.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-slate-300">
              New password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Minimum 8 characters"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">
              Confirm new password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Re-enter your password"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-bold text-[#071015] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Updating password..." : "Save new password"}
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-medium text-emerald-200">
            {message}
          </p>
        )}

        {errorMessage && (
          <p className="mt-4 rounded-xl border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm font-medium text-red-200">
            {errorMessage}
          </p>
        )}
      </section>
    </main>
  );
}