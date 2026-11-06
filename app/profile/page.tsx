"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import TopNav from "@/components/top-nav";
import { browserSupabase } from "@/lib/supabase-browser";
import Link from "next/link";

type WaterEntry = {
  id: string;
  created_at: string;
  amount_oz: number;
  source: "nfc" | "manual";
  bottle_name: string;
};

type ProfileResponse = {
  profile?: {
    display_name?: string | null;
    username?: string | null;
  } | null;
  entries?: WaterEntry[];
  settings?: {
    daily_goal_oz?: number;
  } | null;
};

async function authorizedFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {},
) {
  return fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

function getProfileName(displayName: string, username: string) {
  if (displayName.trim()) return displayName.trim();
  if (username.trim()) return username.trim();
  return "Hydration user";
}

function getInitials(displayName: string, username: string) {
  const source = getProfileName(displayName, username);
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export default function ProfilePage() {
  const [accessToken, setAccessToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [draftDisplayName, setDraftDisplayName] = useState("");
  const [draftUsername, setDraftUsername] = useState("");
  const [entries, setEntries] = useState<WaterEntry[]>([]);
  const [dailyGoalOz, setDailyGoalOz] = useState(96);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        const {
          data: { session },
          error,
        } = await browserSupabase.auth.getSession();

        if (error) throw error;

        if (!session) {
          window.location.replace("/login");
          return;
        }

        if (!isMounted) return;

        setAccessToken(session.access_token);

        const response = await authorizedFetch("/api/profile", session.access_token);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Unable to load profile.");
        }

        const data = (await response.json()) as ProfileResponse;
        const loadedDisplayName = data.profile?.display_name ?? "";
        const loadedUsername = data.profile?.username ?? "";

        setDisplayName(loadedDisplayName);
        setUsername(loadedUsername);
        setDraftDisplayName(loadedDisplayName);
        setDraftUsername(loadedUsername);
        setEntries(Array.isArray(data.entries) ? data.entries : []);
        setDailyGoalOz(Number(data.settings?.daily_goal_oz ?? 96));
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Could not load your profile.",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    setIsSaving(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const response = await authorizedFetch("/api/profile", accessToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: draftDisplayName.trim(),
          username: draftUsername.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save profile.");
      }

      setDisplayName(data.profile?.display_name ?? draftDisplayName.trim());
      setUsername(data.profile?.username ?? draftUsername.trim());
      setDraftDisplayName(data.profile?.display_name ?? draftDisplayName.trim());
      setDraftUsername(data.profile?.username ?? draftUsername.trim());
      setIsEditingProfile(false);
      setStatusMessage("Profile updated successfully.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save profile.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function cancelEdit() {
    setDraftDisplayName(displayName);
    setDraftUsername(username);
    setIsEditingProfile(false);
  }

  async function signOut() {
    await browserSupabase.auth.signOut();
    window.location.replace("/login");
  }

  const profileName = getProfileName(displayName, username);
  const initials = getInitials(displayName, username);

  const lifetimeStats = useMemo(() => {
    const totalLogs = entries.length;
    const totalOz = entries.reduce((sum, entry) => sum + Number(entry.amount_oz), 0);
    const totalGallons = totalOz / 128;

    return { totalLogs, totalOz, totalGallons };
  }, [entries]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0e13] px-5 text-slate-400">
        Loading profile…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0e13] px-4 py-6 text-slate-100 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <TopNav />

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-blue-500 text-2xl font-bold text-[#071015] shadow-lg shadow-cyan-500/20">
                {initials}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                  Profile
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-white">
                  {profileName}
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  {username ? `@${username}` : "Set a username to personalize your profile"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-slate-400">
                    {lifetimeStats.totalGallons.toFixed(1)} lifetime gal
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-slate-400">
                    {lifetimeStats.totalLogs} total logs
                  </span>
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1 text-xs font-semibold text-cyan-200">
                    {dailyGoalOz} oz daily goal
                  </span>
                </div>
              </div>
            </div>

            {!isEditingProfile ? (
              <button
                type="button"
                onClick={() => {
                  setDraftDisplayName(displayName);
                  setDraftUsername(username);
                  setIsEditingProfile(true);
                }}
                className="rounded-lg border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                Edit profile
              </button>
            ) : (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                Cancel
              </button>
            )}
          </div>

          {isEditingProfile && (
            <form
              className="mt-6 grid gap-4 border-t border-white/10 pt-5"
              onSubmit={saveProfile}
            >
              <label className="block">
                <span className="text-sm font-medium text-slate-300">Display name</span>
                <input
                  type="text"
                  maxLength={60}
                  value={draftDisplayName}
                  onChange={(event) => setDraftDisplayName(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-2.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                  placeholder="Your display name"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-300">Username</span>
                <input
                  type="text"
                  maxLength={30}
                  value={draftUsername}
                  onChange={(event) => setDraftUsername(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-2.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                  placeholder="your_username"
                />
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-[#071015] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Account overview
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Your account at a glance
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Keep your identity details current so the rest of the app feels personalized.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Display name
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {displayName || "Not set"}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Username
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {username ? `@${username}` : "Not set"}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Lifetime gallons
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {lifetimeStats.totalGallons.toFixed(1)} gal
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total logs
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {lifetimeStats.totalLogs}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-5">
            <div className="rounded-2xl border border-cyan-300/15 bg-[#111720] p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                Bottle setup
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Add a new bottle
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Pair a bottle tag to your account so future taps log hydration instantly.
              </p>

              <div className="mt-5 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4">
                <p className="text-sm text-slate-300">
                  Use this when setting up your first bottle or adding another one later.
                </p>
              </div>

              <div className="mt-4">
                <Link
                  href="/pair-chip"
                  className="inline-flex rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-[#071015] transition hover:bg-cyan-200"
                >
                  Set up bottle
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Session
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Account actions
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Manage your current session and keep your profile information up to date.
              </p>

              <div className="mt-5 rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                <p className="text-sm text-slate-300">
                  You are signed in as{" "}
                  <span className="font-semibold text-white">{profileName}</span>.
                </p>
                <button
                  type="button"
                  onClick={signOut}
                  className="mt-4 rounded-lg border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </section>

        {statusMessage && (
          <p className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-medium text-emerald-200">
            {statusMessage}
          </p>
        )}

        {errorMessage && (
          <p className="mt-5 rounded-lg border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm font-medium text-red-200">
            {errorMessage}
          </p>
        )}
      </div>
    </main>
  );
}