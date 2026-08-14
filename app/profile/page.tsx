"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase-browser";

type ProfileData = {
  id: string;
  username: string | null;
  displayName: string;
  bio: string;
  friendsCanViewSummary: boolean;
  createdAt: string;
  email: string;
};

type ProfileStats = {
  totalEntries: number;
  totalOunces: number;
  currentStreak: number;
  longestStreak: number;
  dailyGoalOz: number;
};

type Accomplishment = {
  key: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
};

type ProfileResponse = {
  profile: ProfileData;
  stats: ProfileStats;
  accomplishments: Accomplishment[];
};

function formatMemberDate(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));
}

function authorizedFetch(
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

export default function ProfilePage() {
  const router = useRouter();

  const [accessToken, setAccessToken] = useState("");
  const [profileData, setProfileData] = useState<ProfileResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [friendsCanViewSummary, setFriendsCanViewSummary] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const {
        data: { session },
      } = await browserSupabase.auth.getSession();

      if (!session) {
        window.location.replace("/login");
        return;
      }

      if (!isMounted) {
        return;
      }

      setAccessToken(session.access_token);

      try {
        const response = await authorizedFetch(
          "/api/profile",
          session.access_token,
        );

        if (!response.ok) {
          throw new Error("Unable to load profile.");
        }

        const data: ProfileResponse = await response.json();

        if (!isMounted) {
          return;
        }

        setProfileData(data);
        setDisplayName(data.profile.displayName);
        setUsername(data.profile.username ?? "");
        setBio(data.profile.bio);
        setFriendsCanViewSummary(data.profile.friendsCanViewSummary);
      } catch {
        if (isMounted) {
          setErrorMessage("Could not load your profile.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await authorizedFetch("/api/profile", accessToken, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName,
          username,
          bio,
          friendsCanViewSummary,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save profile.");
      }

      setProfileData((currentData) => {
        if (!currentData) {
          return currentData;
        }

        return {
          ...currentData,
          profile: data.profile,
        };
      });

      setDisplayName(data.profile.displayName);
      setUsername(data.profile.username ?? "");
      setBio(data.profile.bio);
      setFriendsCanViewSummary(data.profile.friendsCanViewSummary);
      setIsEditing(false);
      setStatusMessage("Profile saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save profile.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function cancelEditing() {
    if (!profileData) {
      return;
    }

    setDisplayName(profileData.profile.displayName);
    setUsername(profileData.profile.username ?? "");
    setBio(profileData.profile.bio);
    setFriendsCanViewSummary(profileData.profile.friendsCanViewSummary);
    setIsEditing(false);
  }

  async function signOut() {
    await browserSupabase.auth.signOut();
    router.replace("/login");
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 text-slate-600">
        Loading profile…
      </main>
    );
  }

  if (!profileData) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 text-slate-600">
        {errorMessage || "Profile unavailable."}
      </main>
    );
  }

  const { profile, stats, accomplishments } = profileData;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-md">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-sky-600">Water Tracker</p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Your profile
            </h1>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="text-sm font-semibold text-slate-500 underline underline-offset-4 hover:text-slate-900"
          >
            Sign out
          </button>
        </header>

        <nav className="mb-6 flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
          <Link
            href="/"
            className="flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          >
            Dashboard
          </Link>

          <Link
            href="/profile"
            className="flex-1 rounded-xl bg-sky-600 px-3 py-2 text-center text-sm font-semibold text-white"
          >
            Profile
          </Link>
        </nav>

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sky-100 text-2xl font-bold text-sky-700">
                {profile.displayName.slice(0, 1).toUpperCase()}
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold">
                  {profile.displayName}
                </h2>

                <p className="mt-1 truncate text-sm text-slate-500">
                  {profile.username ? `@${profile.username}` : profile.email}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Member since {formatMemberDate(profile.createdAt)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsEditing((editing) => !editing)}
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
            >
              {isEditing ? "Close" : "Edit"}
            </button>
          </div>

          {profile.bio && !isEditing && (
            <p className="mt-5 text-sm leading-6 text-slate-600">
              {profile.bio}
            </p>
          )}

          {isEditing && (
            <form className="mt-6 space-y-4" onSubmit={saveProfile}>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Display name
                </span>

                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={60}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Username
                </span>

                <input
                  type="text"
                  value={username}
                  onChange={(event) =>
                    setUsername(
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_]/g, ""),
                    )
                  }
                  placeholder="jack_covino"
                  minLength={3}
                  maxLength={24}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                />

                <p className="mt-2 text-xs text-slate-500">
                  3–24 lowercase letters, numbers, or underscores.
                </p>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Bio
                </span>

                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  maxLength={160}
                  rows={3}
                  placeholder="Runner, lifter, hydration enthusiast…"
                  className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                />

                <p className="mt-2 text-right text-xs text-slate-500">
                  {bio.length}/160
                </p>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={friendsCanViewSummary}
                  onChange={(event) =>
                    setFriendsCanViewSummary(event.target.checked)
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />

                <span>
                  <span className="block text-sm font-semibold text-slate-800">
                    Share daily summary with friends
                  </span>

                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Friends can see your daily total, goal progress, and streak.
                    They cannot see individual drink timestamps.
                  </span>
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 rounded-xl bg-sky-600 px-4 py-3 font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save profile"}
                </button>

                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={isSaving}
                  className="rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

        {statusMessage && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
            {statusMessage}
          </p>
        )}

        {errorMessage && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">
            {errorMessage}
          </p>
        )}

        <section className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-500">
              Current streak
            </p>

            <p className="mt-2 text-3xl font-bold text-sky-700">
              {stats.currentStreak}
              <span className="ml-1 text-base text-slate-400">days</span>
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-500">
              Longest streak
            </p>

            <p className="mt-2 text-3xl font-bold text-sky-700">
              {stats.longestStreak}
              <span className="ml-1 text-base text-slate-400">days</span>
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-500">
              Total hydration
            </p>

            <p className="mt-2 text-3xl font-bold">
              {stats.totalOunces.toLocaleString()}
              <span className="ml-1 text-base text-slate-400">oz</span>
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-500">
              Bottles logged
            </p>

            <p className="mt-2 text-3xl font-bold">
              {stats.totalEntries.toLocaleString()}
            </p>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm font-medium text-sky-600">
                Accomplishments
              </p>

              <h2 className="mt-1 text-2xl font-bold tracking-tight">
                Keep the current flowing
              </h2>
            </div>

            <p className="text-sm text-slate-500">
              {accomplishments.filter((item) => item.unlocked).length}/
              {accomplishments.length}
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {accomplishments.map((accomplishment) => (
              <article
                key={accomplishment.key}
                className={`rounded-2xl p-4 shadow-sm ring-1 ${
                  accomplishment.unlocked
                    ? "bg-sky-50 ring-sky-200"
                    : "bg-white ring-slate-200"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg ${
                      accomplishment.unlocked
                        ? "bg-sky-600 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {accomplishment.unlocked ? "✓" : "○"}
                  </div>

                  <div>
                    <h3
                      className={
                        accomplishment.unlocked
                          ? "font-bold text-sky-950"
                          : "font-bold text-slate-700"
                      }
                    >
                      {accomplishment.title}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {accomplishment.description}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}