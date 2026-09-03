type SnapshotMode = "7-day" | "monthly";

type TrendDay = {
  dateKey: string;
  label: string;
  fullLabel: string;
  ounces: number;
  isToday: boolean;
  xLabel: string;
};

type SnapshotStatsGridProps = {
  snapshotMode: SnapshotMode;
  selectedMonthKey: string;
  snapshotAverageOz: number;
  snapshotGoalHitCount: number;
  snapshotDaysLength: number;
  snapshotTotalOz: number;
  currentStreak: number;
  bestDay?: TrendDay;
  formatMonthLabel: (monthKey: string) => string;
};

export default function SnapshotStatsGrid({
  snapshotMode,
  selectedMonthKey,
  snapshotAverageOz,
  snapshotGoalHitCount,
  snapshotDaysLength,
  snapshotTotalOz,
  currentStreak,
  bestDay,
  formatMonthLabel,
}: SnapshotStatsGridProps) {
  return (
    <section className="mt-5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            {snapshotMode === "monthly" ? "Monthly stats" : "Weekly stats"}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {snapshotMode === "monthly"
              ? `Based on ${formatMonthLabel(selectedMonthKey)}.`
              : "Based on the last 7 days."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#111720] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {snapshotMode === "monthly" ? "Monthly average" : "7-day average"}
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {snapshotAverageOz}
            <span className="ml-1 text-sm text-slate-500">oz</span>
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#111720] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {snapshotMode === "monthly" ? "Goal days this month" : "Goal days this week"}
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {snapshotGoalHitCount}
            <span className="text-sm text-slate-500">
              {snapshotMode === "monthly" ? ` / ${snapshotDaysLength}` : " / 7"}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#111720] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {snapshotMode === "monthly" ? "Monthly total" : "Current streak"}
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {snapshotMode === "monthly" ? snapshotTotalOz : currentStreak}
            <span className="ml-1 text-sm text-slate-500">
              {snapshotMode === "monthly" ? "oz" : "days"}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#111720] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {snapshotMode === "monthly" ? "Best day this month" : "Best day this week"}
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {bestDay?.ounces ?? 0}
            <span className="ml-1 text-sm text-slate-500">oz</span>
          </p>
        </div>
      </div>
    </section>
  );
}