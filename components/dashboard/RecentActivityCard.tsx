type WaterEntry = {
  id: string;
  created_at: string;
  amount_oz: number;
  source: "nfc" | "manual";
  bottle_name: string | null;
};

type RecentActivityCardProps = {
  todayEntries: WaterEntry[];
  isDeleting: boolean;
  accessToken: string;
  formatTime: (timestamp: string) => string;
  formatOunces: (value: number) => string;
  deleteEntry: (entryId: string) => Promise<void>;
};

export default function RecentActivityCard({
  todayEntries,
  isDeleting,
  accessToken,
  formatTime,
  formatOunces,
  deleteEntry,
}: RecentActivityCardProps) {
  return (
    <section className="mt-8 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Recent activity
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">Today&apos;s log</h2>
        </div>
        <span className="text-sm text-slate-500">{todayEntries.length} entries</span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#111720]">
        {todayEntries.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No water logged yet. Finish your first bottle and tap the tag.
          </p>
        ) : (
          todayEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white">
                  {formatOunces(Number(entry.amount_oz))} oz
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {entry.bottle_name && entry.bottle_name !== "Manual entry"
                    ? `${entry.bottle_name} · ${formatTime(entry.created_at)}`
                    : formatTime(entry.created_at)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    entry.source === "nfc"
                      ? "bg-cyan-300/10 text-cyan-200"
                      : "bg-white/10 text-slate-300"
                  }`}
                >
                  {entry.source.toUpperCase()}
                </span>

                <button
                  type="button"
                  onClick={() => void deleteEntry(entry.id)}
                  disabled={isDeleting || !accessToken}
                  className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:border-red-400/40 hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}