
"use client";

import { useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";

const dailyGoalOz = 96;
const bottleSizeOz = 25;

type WaterEntry = {
  id: string;
  created_at: string;
  amount_oz: number;
  source: "nfc" | "manual";
  bottle_name: string;
};

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatToday() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
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

export default function Home() {
  const [entries, setEntries] = useState<WaterEntry[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const todayEastern = getEasternDateKey(new Date());

  const todayEntries = entries.filter(
    (entry) => getEasternDateKey(entry.created_at) === todayEastern,
  );

  const currentOz = todayEntries.reduce(
    (total, entry) => total + Number(entry.amount_oz),
    0,
  );

  const remainingOz = Math.max(dailyGoalOz - currentOz, 0);

  const progressPercent = Math.min(
    Math.round((currentOz / dailyGoalOz) * 100),
    100,
  );

  const ouncesByEasternDate = entries.reduce<Record<string, number>>(
    (totals, entry) => {
      const entryDateKey = getEasternDateKey(entry.created_at);

      totals[entryDateKey] =
        (totals[entryDateKey] ?? 0) + Number(entry.amount_oz);

      return totals;
    },
    {},
  );

  const weekStart = new Date(`${todayEastern}T12:00:00.000Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  const weeklyDays = Array.from({ length: 7 }, (_, dayIndex) => {
    const day = new Date(weekStart);
    day.setUTCDate(weekStart.getUTCDate() + dayIndex);

    const dateKey = day.toISOString().slice(0, 10);

    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "narrow",
    }).format(day);

    return {
      dayIndex,
      dateKey,
      label,
      ounces: ouncesByEasternDate[dateKey] ?? 0,
      isToday: dateKey === todayEastern,
    };
  });

  const weeklyTotalOz = weeklyDays.reduce(
    (total, day) => total + day.ounces,
    0,
  );

  const daysGoalHit = weeklyDays.filter(
    (day) => day.ounces >= dailyGoalOz,
  ).length;

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
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
          "/api/water-log?days=7",
          session.access_token,
        );

        if (!response.ok) {
          throw new Error("Unable to load water entries.");
        }

        const data = await response.json();

        if (isMounted) {
          setEntries(Array.isArray(data.entries) ? data.entries : []);
        }
      } catch {
        if (isMounted) {
          setErrorMessage("Could not load your hydration data.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  async function logManualBottle() {
    if (!accessToken) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await authorizedFetch(
        "/api/water-log",
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amountOz: bottleSizeOz,
            source: "manual",
            bottleName: "CEMC",
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Unable to save water entry.");
      }

      const data = await response.json();

      if (data.duplicate) {
        setStatusMessage("Duplicate log ignored.");
      } else {
        setEntries((currentEntries) => [data.entry, ...currentEntries]);
        setStatusMessage("Logged 25 oz manually.");
      }
    } catch {
      setErrorMessage("Could not save this bottle. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function undoLastEntry() {
    const mostRecentEntry = todayEntries[0];

    if (!mostRecentEntry || !accessToken) {
      return;
    }

    setIsDeleting(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await authorizedFetch(
        `/api/water-log?id=${mostRecentEntry.id}`,
        accessToken,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error("Unable to delete water entry.");
      }

      setEntries((currentEntries) =>
        currentEntries.filter((entry) => entry.id !== mostRecentEntry.id),
      );

      setStatusMessage("Most recent entry removed.");
    } catch {
      setErrorMessage("Could not undo this entry. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function signOut() {
    await browserSupabase.auth.signOut();
    window.location.replace("/login");
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 text-slate-600">
        Checking secure session…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-md">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-sky-600">Water Tracker</p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              {formatToday()}
            </h1>

            <p className="mt-2 text-slate-600">
              Tap your CEMC bottle tag after each 25 oz refill.
            </p>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="text-sm font-semibold text-slate-500 underline underline-offset-4 hover:text-slate-900"
          >
            Sign out
          </button>
        </header>

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Today&apos;s intake
              </p>

              <p className="mt-2 text-5xl font-bold tracking-tight">
                {currentOz}
                <span className="ml-1 text-2xl text-slate-400">oz</span>
              </p>
            </div>

            <div className="rounded-2xl bg-sky-100 px-3 py-2 text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Goal
              </p>

              <p className="text-lg font-bold text-sky-900">
                {dailyGoalOz} oz
              </p>
            </div>
          </div>

          <div className="mt-7">
            <div className="h-4 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="mt-3 flex justify-between text-sm">
              <span className="font-medium text-sky-700">
                {progressPercent}% complete
              </span>

              <span className="text-slate-500">
                {remainingOz} oz remaining
              </span>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Last 7 days
              </p>

              <p className="mt-1 text-2xl font-bold tracking-tight">
                {weeklyTotalOz} oz
              </p>
            </div>

            <div className="text-right">
              <p className="text-sm font-semibold text-sky-700">
                {daysGoalHit}/7
              </p>

              <p className="mt-1 text-xs text-slate-500">goals reached</p>
            </div>
          </div>

          <div className="mt-6 grid h-32 grid-cols-7 items-end gap-2">
            {weeklyDays.map((day) => {
              const heightPercent = Math.min(
                Math.max(
                  (day.ounces / dailyGoalOz) * 100,
                  day.ounces > 0 ? 8 : 0,
                ),
                100,
              );

              return (
                <div
                  key={day.dateKey}
                  className="flex h-full flex-col items-center justify-end gap-2"
                >
                  <div className="flex h-full w-full items-end rounded-lg bg-slate-100">
                    <div
                      className={`w-full rounded-lg transition-all duration-300 ${
                        day.isToday ? "bg-sky-600" : "bg-sky-300"
                      }`}
                      style={{ height: `${heightPercent}%` }}
                      title={`${day.ounces} oz`}
                    />
                  </div>

                  <span
                    className={`text-xs font-semibold ${
                      day.isToday ? "text-sky-700" : "text-slate-500"
                    }`}
                  >
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-5 text-sm text-slate-500">
            Each bar shows water logged for that Eastern Time calendar day. The
            full height represents your {dailyGoalOz} oz goal.
          </p>
        </section>

        <section className="mt-6 rounded-2xl bg-sky-600 p-5 text-white shadow-sm">
          <p className="text-sm font-medium text-sky-100">CEMC NFC bottle</p>

          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-bold">{bottleSizeOz} oz</p>

              <p className="mt-1 text-sm text-sky-100">
                Duplicate logging protection is active.
              </p>
            </div>

            <button
              type="button"
              onClick={logManualBottle}
              disabled={isSaving || !accessToken}
              className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-sky-700 transition hover:bg-sky-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Log manually"}
            </button>
          </div>
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

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Today&apos;s activity</h2>

            <span className="text-sm text-slate-500">
              {todayEntries.length} entries
            </span>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            {todayEntries.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No water logged yet. Finish your first bottle and tap the tag.
              </p>
            )}

            {todayEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between border-b border-slate-100 px-5 py-4 last:border-b-0"
              >
                <div>
                  <p className="font-semibold">{entry.amount_oz} oz logged</p>

                  <p className="mt-1 text-sm text-slate-500">
                    {formatTime(entry.created_at)}
                  </p>
                </div>

                <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-700">
                  {entry.source.toUpperCase()}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={undoLastEntry}
            disabled={
              todayEntries.length === 0 || isDeleting || !accessToken
            }
            className="mt-4 text-sm font-semibold text-slate-500 underline underline-offset-4 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDeleting ? "Undoing..." : "Undo most recent entry"}
          </button>
        </section>
      </div>
    </main>
  );
}