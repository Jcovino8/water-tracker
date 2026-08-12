
"use client";

import { useEffect, useState } from "react";

const dailyGoalOz = 128;
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
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatToday() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

export default function Home() {
  const [entries, setEntries] = useState<WaterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(""); 

  const currentOz = entries.reduce(
    (total, entry) => total + Number(entry.amount_oz),
    0,
  );

  const remainingOz = Math.max(dailyGoalOz - currentOz, 0);
  const progressPercent = Math.min(
    Math.round((currentOz / dailyGoalOz) * 100),
    100,
  );

  useEffect(() => {
    async function loadEntries() {
      try {
        const response = await fetch("/api/water-log");

        if (!response.ok) {
          throw new Error("Unable to load water entries.");
        }

        const data = await response.json();
        setEntries(data.entries);
      } catch {
        setErrorMessage("Could not load your hydration data.");
      } finally {
        setIsLoading(false);
      }
    }

    loadEntries();
  }, []);

  async function logBottle() {
    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/water-log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountOz: bottleSizeOz,
          source: "nfc",
          bottleName: "CEMC",
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to save water entry.");
      }

      const data = await response.json();

      setEntries((currentEntries) => [data.entry, ...currentEntries]);
    } catch {
      setErrorMessage("Could not save this bottle. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function undoLastEntry() {
  const mostRecentEntry = entries[0];

  if (!mostRecentEntry) {
    return;
  }

  setIsDeleting(true);
  setErrorMessage("");

  try {
    const response = await fetch(
      `/api/water-log?id=${mostRecentEntry.id}`,
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
  } catch {
    setErrorMessage("Could not undo this entry. Please try again.");
  } finally {
    setIsDeleting(false);
  }
}

  

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-md">
        <header className="mb-8">
          <p className="text-sm font-medium text-sky-600">Water Tracker</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {formatToday()}
          </h1>
          <p className="mt-2 text-slate-600">
            Tap your bottle&apos;s NFC tag when you finish a refill.
          </p>
        </header>

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Today&apos;s intake
              </p>
              <p className="mt-2 text-5xl font-bold tracking-tight">
                {isLoading ? "—" : currentOz}
                <span className="ml-1 text-2xl text-slate-400">oz</span>
              </p>
            </div>

            <div className="rounded-2xl bg-sky-100 px-3 py-2 text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Goal
              </p>
              <p className="text-lg font-bold text-sky-900">{dailyGoalOz} oz</p>
            </div>
          </div>

          <div className="mt-7">
            <div className="h-4 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-300"
                style={{ width: `${isLoading ? 0 : progressPercent}%` }}
              />
            </div>

            <div className="mt-3 flex justify-between text-sm">
              <span className="font-medium text-sky-700">
                {isLoading ? "Loading..." : `${progressPercent}% complete`}
              </span>
              <span className="text-slate-500">
                {isLoading ? "" : `${remainingOz} oz remaining`}
              </span>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-sky-600 p-5 text-white shadow-sm">
          <p className="text-sm font-medium text-sky-100">CEMC NFC bottle</p>

          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-bold">{bottleSizeOz} oz</p>
              <p className="mt-1 text-sm text-sky-100">
                Temporary button that simulates an NFC tap.
              </p>
            </div>

            <button
              type="button"
              onClick={logBottle}
              disabled={isSaving}
              className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-sky-700 transition hover:bg-sky-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : `Log ${bottleSizeOz} oz`}
            </button>
          </div>
        </section>

        {errorMessage && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">
            {errorMessage}
          </p>
        )}

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Today&apos;s activity</h2>
            <span className="text-sm text-slate-500">
              {isLoading ? "..." : `${entries.length} entries`}
            </span>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            {!isLoading && entries.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No water logged yet. Finish your first bottle and tap the tag.
              </p>
            )}

            {entries.map((entry) => (
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
            disabled={entries.length === 0 || isDeleting}
            className="mt-4 text-sm font-semibold text-slate-500 underline underline-offset-4 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDeleting ? "Undoing..." : "Undo most recent entry"}
          </button>
        </section>

      </div>
    </main>
  );
}