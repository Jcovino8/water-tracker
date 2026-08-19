"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";

type AuthMode = "login" | "signup";

const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "nonbinary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

function normalizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState("prefer_not_to_say");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [weightLbs, setWeightLbs] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await browserSupabase.auth.getSession();

      if (isMounted && session) {
        window.location.replace("/");
      }
    }

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const normalizedUsername = useMemo(
    () => normalizeUsername(username),
    [username],
  );

  const parsedFeet = Number(heightFeet);
  const parsedInches = Number(heightInches);
  const parsedWeight = Number(weightLbs);

  const totalHeightInches =
    Number.isFinite(parsedFeet) && Number.isFinite(parsedInches)
      ? parsedFeet * 12 + parsedInches
      : NaN;

  const signupPasswordIsValid = signupPassword.length >= 8;
  const signupPasswordsMatch =
    signupPassword.length > 0 &&
    confirmPassword.length > 0 &&
    signupPassword === confirmPassword;

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setMessage("");
    setErrorMessage("");

    const { error } = await browserSupabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    window.location.replace("/");
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setMessage("");
    setErrorMessage("");

    if (!displayName.trim()) {
      setErrorMessage("Please enter your name.");
      setIsSubmitting(false);
      return;
    }

    if (!normalizedUsername) {
      setErrorMessage("Please choose a username using letters, numbers, or underscores.");
      setIsSubmitting(false);
      return;
    }

    if (!signupPasswordIsValid) {
      setErrorMessage("Password must be at least 8 characters.");
      setIsSubmitting(false);
      return;
    }

    if (!signupPasswordsMatch) {
      setErrorMessage("Passwords do not match.");
      setIsSubmitting(false);
      return;
    }

    if (
      !Number.isFinite(totalHeightInches) ||
      parsedFeet < 3 ||
      parsedFeet > 8 ||
      parsedInches < 0 ||
      parsedInches > 11
    ) {
      setErrorMessage("Enter a valid height.");
      setIsSubmitting(false);
      return;
    }

    if (!Number.isFinite(parsedWeight) || parsedWeight < 60 || parsedWeight > 700) {
      setErrorMessage("Enter a valid weight in pounds.");
      setIsSubmitting(false);
      return;
    }

    const { data, error } = await browserSupabase.auth.signUp({
      email: signupEmail.trim(),
      password: signupPassword,
      options: {
        data: {
          display_name: displayName.trim(),
          username: normalizedUsername,
          gender,
          height_inches: Number(totalHeightInches.toFixed(2)),
          weight_lbs: Number(parsedWeight.toFixed(2)),
        },
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      window.location.replace("/");
      return;
    }

    setMessage(
      "Account created. Check your email to verify your address, then log in.",
    );
    setMode("login");
    setLoginEmail(signupEmail.trim());
    setLoginPassword("");
    setIsSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-[#0b0e13] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-r border-white/5 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_30%),linear-gradient(180deg,#0f1722_0%,#0b0e13_58%,#0a0d12_100%)] px-10 py-12 lg:flex lg:flex-col">
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.03),transparent_22%,transparent_78%,rgba(255,255,255,0.02))]" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,0.14)]">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/90">
                Water Tracker
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Personal hydration, designed like a real product.
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-20 max-w-xl">
            <p className="mt-5 text-5xl font-semibold tracking-[-0.05em] text-cyan-300/80">
              Welcome to Tally
            </p>
            <h1 className="text-sm font-medium uppercase tracking-[0.18em]className= text-white">
              Sip. Tap. Track.
            </h1>
  
          </div>

          <div className="relative z-10 mt-auto grid gap-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300/75">
                How it works
              </p>
              <div className="mt-4 grid gap-3 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  Log your water intake with a simple tap of the cap.
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  Visualize trends and progress.
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  Gain actionable insights to improve health.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-xl">
            <div className="mb-6 lg:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/90">
                Tally
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Sip. Tap. Track.
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Sign in to your account or create one in under a minute.
              </p>
            </div>

            <section className="rounded-[28px] border border-white/10 bg-[#111720] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-7">
              <div className="inline-flex rounded-2xl border border-white/10 bg-[#0b0e13] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setMessage("");
                    setErrorMessage("");
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    mode === "login"
                      ? "bg-cyan-300 text-[#071015]"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setMessage("");
                    setErrorMessage("");
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    mode === "signup"
                      ? "bg-cyan-300 text-[#071015]"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  Sign up
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setMessage("");
                    setErrorMessage("");

                    const email = loginEmail.trim();

                    if (!email) {
                      setErrorMessage("Enter your email first, then request a password reset.");
                      return;
                    }

                    const { error } = await browserSupabase.auth.resetPasswordForEmail(email, {
                      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
                    });

                    if (error) {
                      setErrorMessage(error.message);
                      return;
                    }

                    setMessage("Password reset link sent. Check your email.");
                  }}
                  className="mt-1 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
                >
                  Forgot password?
                </button>
              </div>


              {mode === "login" ? (
                <div>
                  <div className="mt-6">
                    <h2 className="text-3xl font-semibold tracking-tight text-white">
                      Welcome back
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Use your email and password to access your hydration dashboard.
                    </p>
                  </div>

                  <form className="mt-6 space-y-4" onSubmit={handleLogin}>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-300">Email</span>
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(event) => setLoginEmail(event.target.value)}
                        autoComplete="email"
                        required
                        placeholder="you@example.com"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-300">Password</span>
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(event) => setLoginPassword(event.target.value)}
                        autoComplete="current-password"
                        required
                        placeholder="Enter your password"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-bold text-[#071015] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? "Signing in..." : "Log in"}
                    </button>
                  </form>
                </div>
              ) : (
                <div>
                  <div className="mt-6">
                    <h2 className="text-3xl font-semibold tracking-tight text-white">
                      Create your account
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Set up your profile once so your hydration experience starts with context.
                    </p>
                  </div>

                  <form className="mt-6 space-y-4" onSubmit={handleSignup}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <span className="text-sm font-medium text-slate-300">Email</span>
                        <input
                          type="email"
                          value={signupEmail}
                          onChange={(event) => setSignupEmail(event.target.value)}
                          autoComplete="email"
                          required
                          placeholder="you@example.com"
                          className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-300">Name</span>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(event) => setDisplayName(event.target.value)}
                          autoComplete="name"
                          required
                          placeholder="Your name"
                          className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-300">Username</span>
                        <input
                          type="text"
                          value={username}
                          onChange={(event) => setUsername(normalizeUsername(event.target.value))}
                          autoCapitalize="none"
                          autoCorrect="off"
                          required
                          placeholder="your_username"
                          className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-300">Password</span>
                        <input
                          type="password"
                          value={signupPassword}
                          onChange={(event) => setSignupPassword(event.target.value)}
                          autoComplete="new-password"
                          required
                          placeholder="Minimum 8 characters"
                          className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-300">Confirm password</span>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          autoComplete="new-password"
                          required
                          placeholder="Re-enter password"
                          className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-300">Gender</span>
                        <select
                          value={gender}
                          onChange={(event) => setGender(event.target.value)}
                          className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                        >
                          {genderOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="block">
                        <span className="text-sm font-medium text-slate-300">Height</span>
                        <div className="mt-2 grid grid-cols-2 gap-3">
                          <input
                            type="number"
                            min="3"
                            max="8"
                            step="1"
                            value={heightFeet}
                            onChange={(event) => setHeightFeet(event.target.value)}
                            required
                            placeholder="ft"
                            className="w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                          />
                          <input
                            type="number"
                            min="0"
                            max="11"
                            step="1"
                            value={heightInches}
                            onChange={(event) => setHeightInches(event.target.value)}
                            required
                            placeholder="in"
                            className="w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                          />
                        </div>
                      </div>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-300">Weight (lb)</span>
                        <input
                          type="number"
                          min="60"
                          max="700"
                          step="0.1"
                          value={weightLbs}
                          onChange={(event) => setWeightLbs(event.target.value)}
                          required
                          placeholder="180"
                          className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#0b0e13] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300/80">
                        Account quality
                      </p>
                      <div className="mt-2 space-y-1 text-sm text-slate-400">
                        <p>Password length: {signupPassword.length >= 8 ? "Good" : "Must be 8+ chars"}</p>
                        <p>Passwords match: {signupPasswordsMatch ? "Yes" : "Not yet"}</p>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-bold text-[#071015] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? "Creating account..." : "Create account"}
                    </button>
                  </form>
                </div>
              )}

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
          </div>
        </section>
      </div>
    </main>
  );
}