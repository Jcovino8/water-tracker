"use client";

import { useEffect, useMemo, useState } from "react";

type HydrationPaceCardProps = {
  dailyGoalOz: number;
  bottleSizeOz: number;
  currentOz: number;
};

type SimpleCheckpoint = {
  time: string;
  label: string;
  targetOz: number;
};

type PaceState = "behind" | "on-pace" | "ahead" | "goal-complete";

const stateStyles: Record<
  PaceState,
  { badge: string; bar: string }
> = {
  behind: { badge: "bg-amber-500/15 text-amber-300", bar: "bg-amber-400" },
  "on-pace": { badge: "bg-sky-500/15 text-sky-300", bar: "bg-sky-400" },
  ahead: { badge: "bg-emerald-500/15 text-emerald-300", bar: "bg-emerald-400" },
  "goal-complete": { badge: "bg-emerald-500/15 text-emerald-300", bar: "bg-emerald-400" },
};

function getEasternHour(date: Date) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
  );
}

function formatCheckpointLabel(hour24: number) {
  const date = new Date();
  date.setHours(hour24, 0, 0, 0);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function buildSimplePlan(dailyGoalOz: number): SimpleCheckpoint[] {
  const checkpoints = [8, 12, 15, 18, 21];
  return checkpoints.map((hour, index) => ({
    time: String(hour),
    label:
      index === checkpoints.length - 1
        ? `${formatCheckpointLabel(hour)} target`
        : `By ${formatCheckpointLabel(hour)}`,
    targetOz: Math.round((dailyGoalOz * (index + 1)) / checkpoints.length),
  }));
}

function CheckpointRow({
  checkpoint,
  currentOz,
}: {
  checkpoint: SimpleCheckpoint;
  currentOz: number;
}) {
  const isComplete = currentOz >= checkpoint.targetOz;

  return (
    <div className="flex items-center justify-between border-b border-white/5 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            isComplete
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-white/5 text-slate-400"
          }`}
        >
          {isComplete ? "✓" : ""}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-100">
            {checkpoint.label}
          </p>
        </div>
      </div>
      <p
        className={`text-sm font-semibold ${
          isComplete ? "text-emerald-300" : "text-slate-400"
        }`}
      >
        {checkpoint.targetOz} oz
      </p>
    </div>
  );
}

export function HydrationPaceCard({
  dailyGoalOz,
  bottleSizeOz,
  currentOz,
}: HydrationPaceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(interval);
  }, []);

  const checkpoints = useMemo(
    () => buildSimplePlan(dailyGoalOz),
    [dailyGoalOz],
  );

  const currentHour = getEasternHour(now);
  const elapsedDayRatio = Math.min(Math.max(currentHour / 24, 0), 1);
  const expectedByNow = Math.round(dailyGoalOz * elapsedDayRatio);
  const difference = currentOz - expectedByNow;

  let paceState: PaceState = "on-pace";
  let paceMessage = `You are on track for ${dailyGoalOz} oz today.`;
  let suggestion = `Aim for about ${expectedByNow} oz by this point in the day.`;

  if (currentOz >= dailyGoalOz) {
    const sugg = Math.round(currentOz - dailyGoalOz);
    paceState = "goal-complete";
    paceMessage = "Goal complete for today.";
    suggestion =
      difference > 0
        ? `${sugg} oz above goal. Nice work.`
        : "You hit your goal exactly.";
  } else if (difference <= -Math.max(8, bottleSizeOz / 2)) {
    paceState = "behind";
    paceMessage = "You are a bit behind pace.";
    suggestion =
      difference <= -bottleSizeOz
        ? `One bottle now would put you much closer to pace.`
        : `A small refill now would get you back on track.`;
  } else if (difference >= bottleSizeOz / 2) {
    paceState = "ahead";
    paceMessage = "You are ahead of pace.";
    suggestion = "Keep cruising at this rate.";
  }

  const style = stateStyles[paceState];
  const progressPercent = Math.min(
    Math.round((currentOz / Math.max(dailyGoalOz, 1)) * 100),
    100,
  );

  return (
    <section className="rounded-3xl border border-white/5 bg-slate-900/60 p-6 shadow-lg shadow-black/20 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Today&apos;s pace
          </p>
          <p className="mt-2 text-xl font-bold text-slate-50">
            {paceMessage}
          </p>
          {suggestion && (
            <p className="mt-1 text-sm text-slate-400">{suggestion}</p>
          )}
        </div>

        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${style.badge}`}
        >
          {paceState.replace("-", " ")}
        </span>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="mt-4 text-sm font-semibold text-slate-400 underline underline-offset-4 transition hover:text-slate-200"
      >
        {isExpanded ? "Hide schedule" : "View hydration schedule"}
      </button>

      {isExpanded && (
        <div className="mt-4 rounded-2xl bg-black/20 px-4">
          {checkpoints.map((checkpoint) => (
            <CheckpointRow
              key={checkpoint.time}
              checkpoint={checkpoint}
              currentOz={currentOz}
            />
          ))}
        </div>
      )}
    </section>
  );
}