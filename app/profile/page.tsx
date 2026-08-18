"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import TopNav from "@/components/top-nav";
import { browserSupabase } from "@/lib/supabase-browser";

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

type Achievement = {
  key: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress: number;
  target: number;
  icon: string;
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

function getEasternDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function calculateLongestGoalStreak(
  dayTotals: Array<{ dateKey: string; ounces: number }>,
  dailyGoalOz: number,
) {
  let longest = 0;
  let current = 0;

  for (const day of dayTotals) {
    if (day.ounces >= dailyGoalOz) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }

  return longest;
}

function clampProgress(value: number, target: number) {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function buildAchievements(params: {
  totalLogs: number;
  totalOz: number;
  goalDays: number;
  longestGoalStreak: number;
  bestDayOz: number;
  dailyGoalOz: number;
}) {
  const {
    totalLogs,
    totalOz,
    goalDays,
    longestGoalStreak,
    bestDayOz,
    dailyGoalOz,
  } = params;

  const achievements: Achievement[] = [
    {
      key: "first-log",
      title: "First log",
      description: "Logged hydration for the first time.",
      unlocked: totalLogs >= 1,
      progress: Math.min(totalLogs, 1),
      target: 1,
      icon: "💧",
    },
    {
      key: "thirty-logs",
      title: "30 logs",
      description: "Logged water 30 times.",
      unlocked: totalLogs >= 30,
      progress: Math.min(totalLogs, 30),
      target: 30,
      icon: "📝",
    },
    {
      key: "lifetime-1000",
      title: "1000 oz club",
      description: "Reached 1000 lifetime ounces.",
      unlocked: totalOz >= 1000,
      progress: Math.min(totalOz, 1000),
      target: 1000,
      icon: "🏆",
    },
    {
      key: "first-goal-day",
      title: "First goal day",
      description: "Hit your daily hydration goal once.",
      unlocked: goalDays >= 1,
      progress: Math.min(goalDays, 1),
      target: 1,
      icon: "🎯",
    },
    {
      key: "five-goal-days",
      title: "5 goal days",
      description: "Hit your daily goal on 5 separate days.",
      unlocked: goalDays >= 5,
      progress: Math.min(goalDays, 5),
      target: 5,
      icon: "✅",
    },
    {
      key: "ten-goal-days",
      title: "10 goal days",
      description: "Hit your daily goal on 10 separate days.",
      unlocked: goalDays >= 10,
      progress: Math.min(goalDays, 10),
      target: 10,
      icon: "🌟",
    },
    {
      key: "streak-3",
      title: "3-day streak",
      description: "Reached your goal 3 days in a row.",
      unlocked: longestGoalStreak >= 3,
      progress: Math.min(longestGoalStreak, 3),
      target: 3,
      icon: "🔥",
    },
    {
      key: "streak-5",
      title: "5-day streak",
      description: "Reached your goal 5 days in a row.",
      unlocked: longestGoalStreak >= 5,
      progress: Math.min(longestGoalStreak, 5),
      target: 5,
      icon: "⚡",
    },
    {
      key: "streak-7",
      title: "7-day streak",
      description: "Reached your goal 7 days in a row.",
      unlocked: longestGoalStreak >= 7,
      progress: Math.min(longestGoalStreak, 7),
      target: 7,
      icon: "👑",
    },
    {
      key: "best-day-over-goal",
      title: "Above and beyond",
      description: "Logged a best day above your target.",
      unlocked: bestDayOz > dailyGoalOz,
      progress: Math.min(bestDayOz, dailyGoalOz + 1),
      target: dailyGoalOz + 1,
      icon: "🚀",
    },
  ];

  return achievements;
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
  const [isLockerOpen, setIsLockerOpen] = useState(false);
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

  const {
    totalLogs,
    totalOz,
    goalDays,
    bestDay,
    longestGoalStreak,
    achievements,
    unlockedAchievements,
    lockedAchievements,
  } = useMemo(() => {
    const totalLogs = entries.length;
    const totalOz = entries.reduce(
      (sum, entry) => sum + Number(entry.amount_oz),
      0,
    );

    const ouncesByDate = entries.reduce<Record<string, number>>((totals, entry) => {
      const dateKey = getEasternDateKey(entry.created_at);
      totals[dateKey] = (totals[dateKey] ?? 0) + Number(entry.amount_oz);
      return totals;
    }, {});

    const dayTotals = Object.entries(ouncesByDate)
      .map(([dateKey, ounces]) => ({ dateKey, ounces }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    const goalDays = dayTotals.filter((day) => day.ounces >= dailyGoalOz).length;

    const bestDay =
      dayTotals.length > 0
        ? dayTotals.reduce((best, day) => (day.ounces > best.ounces ? day : best))
        : null;

    const longestGoalStreak = calculateLongestGoalStreak(dayTotals, dailyGoalOz);

    const achievements = buildAchievements({
      totalLogs,
      totalOz,
      goalDays,
      longestGoalStreak,
      bestDayOz: bestDay?.ounces ?? 0,
      dailyGoalOz,
    });

    const unlockedAchievements = achievements.filter(
      (achievement) => achievement.unlocked,
    );
    const lockedAchievements = achievements.filter(
      (achievement) => !achievement.unlocked,
    );

    return {
      totalLogs,
      totalOz,
      goalDays,
      bestDay,
      longestGoalStreak,
      achievements,
      unlockedAchievements,
      lockedAchievements,
    };
  }, [dailyGoalOz, entries]);

  const profileName = getProfileName(displayName, username);
  const initials = getInitials(displayName, username);

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

        <section className="rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
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
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1 text-xs font-semibold text-cyan-200">
                    {unlockedAchievements.length} achievements
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-slate-400">
                    {totalOz} lifetime oz
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
            <form className="mt-6 grid gap-4 border-t border-white/10 pt-5" onSubmit={saveProfile}>
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

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-[#111720] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Best day
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {bestDay?.ounces ?? 0}
              <span className="ml-1 text-sm text-slate-500">oz</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {bestDay ? formatFullDate(`${bestDay.dateKey}T12:00:00`) : "No logs yet"}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#111720] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Lifetime ounces
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {totalOz}
              <span className="ml-1 text-sm text-slate-500">oz</span>
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#111720] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total logs
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">{totalLogs}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#111720] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Longest streak
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {longestGoalStreak}
              <span className="ml-1 text-sm text-slate-500">days</span>
            </p>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                  Achievement progress
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Next unlocks
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Keep going — these milestones are still in progress.
                </p>
              </div>

              <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-2 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200/80">
                  Total unlocked
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {unlockedAchievements.length}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {lockedAchievements.length === 0 ? (
                <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                  <p className="text-sm font-semibold text-emerald-200">
                    Everything unlocked
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    You have completed every current achievement.
                  </p>
                </div>
              ) : (
                lockedAchievements.map((achievement) => (
                  <div
                    key={achievement.key}
                    className="rounded-xl border border-white/10 bg-[#0b0e13] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-lg">
                          {achievement.icon}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-200">
                            {achievement.title}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {achievement.description}
                          </p>
                        </div>
                      </div>

                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Locked
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {achievement.progress} / {achievement.target}
                        </span>
                        <span>{clampProgress(achievement.progress, achievement.target)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-300 transition-all duration-500"
                          style={{
                            width: `${clampProgress(
                              achievement.progress,
                              achievement.target,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/80">
                  Achievement locker
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Collected badges
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  View every milestone you have already unlocked.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsLockerOpen((current) => !current)}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                {isLockerOpen ? "Hide" : "Open"}
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-4">
              <p className="text-sm text-slate-300">
                You have unlocked{" "}
                <span className="font-semibold text-white">
                  {unlockedAchievements.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-white">
                  {achievements.length}
                </span>{" "}
                achievements and reached your goal on{" "}
                <span className="font-semibold text-white">{goalDays}</span> total days.
              </p>
            </div>

            {isLockerOpen && (
              <div className="mt-4 grid gap-3">
                {unlockedAchievements.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                    <p className="text-sm font-semibold text-slate-300">
                      No badges unlocked yet
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Log your first bottle to start your collection.
                    </p>
                  </div>
                ) : (
                  unlockedAchievements.map((achievement) => (
                    <div
                      key={achievement.key}
                      className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-300 text-lg text-[#071015]">
                            {achievement.icon}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {achievement.title}
                            </p>
                            <p className="mt-1 text-sm text-slate-400">
                              {achievement.description}
                            </p>
                          </div>
                        </div>

                        <span className="rounded-full bg-cyan-300 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#071015]">
                          Unlocked
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
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