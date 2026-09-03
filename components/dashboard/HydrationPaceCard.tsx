"use client";

import { useEffect, useMemo, useState } from "react";

type HydrationEntry = {
  id: string;
  created_at: string;
  amount_oz: number;
  source: "nfc" | "manual";
  bottle_name: string | null;
};

type HydrationPaceCardProps = {
  dailyGoalOz: number;
  bottleSizeOz: number;
  currentOz: number;
  todayEntries: HydrationEntry[];
};

type SimpleCheckpoint = {
  hour24: number;
  label: string;
  targetOz: number;
};

type PaceState = "behind" | "on-pace" | "ahead" | "goal-complete";
type CheckpointStatus = "upcoming" | "active" | "complete" | "close-missed" | "missed";

type EvaluatedCheckpoint = SimpleCheckpoint & {
  ouncesByCheckpoint: number;
  deficitOz: number;
  status: CheckpointStatus;
};

const stateStyles: Record<PaceState, { badge: string; bar: string }> = {
  behind: { badge: "bg-amber-500/15 text-amber-300", bar: "bg-amber-400" },
  "on-pace": { badge: "bg-sky-500/15 text-sky-300", bar: "bg-sky-400" },
  ahead: { badge: "bg-emerald-500/15 text-emerald-300", bar: "bg-emerald-400" },
  "goal-complete": { badge: "bg-emerald-500/15 text-emerald-300", bar: "bg-emerald-400" },
};

const checkpointStyles: Record<
  CheckpointStatus,
  {
    dot: string;
    border: string;
    label: string;
    subcopy: string;
    pill: string;
  }
> = {
  complete: {
    dot: "bg-emerald-400",
    border: "border-emerald-400/20 bg-emerald-400/[0.03]",
    label: "text-emerald-100",
    subcopy: "text-emerald-200/75",
    pill: "bg-emerald-500/10 text-emerald-300",
  },
  "close-missed": {
    dot: "bg-amber-300",
    border: "border-amber-300/20 bg-amber-300/[0.03]",
    label: "text-amber-100",
    subcopy: "text-amber-200/75",
    pill: "bg-amber-500/10 text-amber-300",
  },
  missed: {
    dot: "bg-rose-400",
    border: "border-rose-400/20 bg-rose-400/[0.03]",
    label: "text-rose-100",
    subcopy: "text-rose-200/75",
    pill: "bg-rose-500/10 text-rose-300",
  },
  active: {
    dot: "bg-cyan-300",
    border: "border-cyan-300/20 bg-cyan-300/[0.04]",
    label: "text-cyan-100",
    subcopy: "text-cyan-200/80",
    pill: "bg-cyan-300/10 text-cyan-200",
  },
  upcoming: {
    dot: "bg-slate-600",
    border: "border-white/10 bg-[#0b0e13]",
    label: "text-white",
    subcopy: "text-slate-500",
    pill: "bg-white/5 text-slate-400",
  },
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

function getEasternParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    hour: Number(getPart("hour")),
    minute: Number(getPart("minute")),
  };
}

function getEasternMinutesIntoDay(date: Date) {
  const { hour, minute } = getEasternParts(date);
  return hour * 60 + minute;
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
    hour24: hour,
    label:
      index === checkpoints.length - 1
        ? `${formatCheckpointLabel(hour)} target`
        : `By ${formatCheckpointLabel(hour)}`,
    targetOz: Math.round((dailyGoalOz * (index + 1)) / checkpoints.length),
  }));
}

function getOuncesByCheckpoint(
  checkpoint: SimpleCheckpoint,
  entries: HydrationEntry[],
) {
  const checkpointMinutes = checkpoint.hour24 * 60;

  return entries.reduce((total, entry) => {
    const entryMinutes = getEasternMinutesIntoDay(new Date(entry.created_at));
    return entryMinutes <= checkpointMinutes
      ? total + Number(entry.amount_oz)
      : total;
  }, 0);
}

function getCurrentCheckpointTarget(
  checkpoints: SimpleCheckpoint[],
  currentHour: number,
) {
  return (
    checkpoints.find((checkpoint) => currentHour <= checkpoint.hour24) ??
    checkpoints[checkpoints.length - 1]
  );
}

function getPaceMessage(params: {
  currentOz: number;
  targetNowOz: number;
  bottleSizeOz: number;
  dailyGoalOz: number;
}) {
  const { currentOz, targetNowOz, bottleSizeOz, dailyGoalOz } = params;

  if (currentOz >= dailyGoalOz) {
    return {
      state: "goal-complete" as const,
      badge: "Goal complete",
      message: `You cleared your goal with ${Math.round(currentOz)} oz today.`,
      suggestion: "Anything else from here is extra credit.",
    };
  }

  const deficit = Math.max(targetNowOz - currentOz, 0);

  if (deficit <= 0) {
    return {
      state: "ahead" as const,
      badge: "Ahead of pace",
      message: "You are ahead of pace right now.",
      suggestion:
        currentOz + bottleSizeOz >= dailyGoalOz
          ? "One more bottle could finish the day."
          : "Keep this rhythm and the rest of the day gets easier.",
    };
  }

  if (deficit <= Math.max(4, bottleSizeOz * 0.35)) {
    return {
      state: "on-pace" as const,
      badge: "Close to pace",
      message: "You are close to pace right now.",
      suggestion: "A small drink would put you back on track.",
    };
  }

  if (deficit <= bottleSizeOz * 1.05) {
    return {
      state: "behind" as const,
      badge: "Behind pace",
      message: "One bottle now would put you much closer to pace.",
      suggestion: `${Math.round(deficit)} oz behind your current checkpoint.`,
    };
  }

  if (deficit <= bottleSizeOz * 2) {
    return {
      state: "behind" as const,
      badge: "Off pace",
      message: "You are pretty far behind pace right now.",
      suggestion: "Two steady drinks across the next stretch would help.",
    };
  }

  return {
    state: "behind" as const,
    badge: "Way behind pace",
    message: "You are way behind pace right now.",
    suggestion: "Start recovering now so the next target feels realistic.",
  };
}

function getCheckpointTag(status: CheckpointStatus) {
  switch (status) {
    case "complete":
      return "Hit";
    case "close-missed":
      return "Close miss";
    case "missed":
      return "Missed";
    case "active":
      return "Current";
    default:
      return "Upcoming";
  }
}

function CheckpointRow({
  checkpoint,
  isLast,
}: {
  checkpoint: EvaluatedCheckpoint;
  isLast: boolean;
}) {
  const styles = checkpointStyles[checkpoint.status];

  let statusCopy = "";

  if (checkpoint.status === "complete") {
    statusCopy = `${Math.round(checkpoint.ouncesByCheckpoint)} oz logged by then`;
  } else if (checkpoint.status === "close-missed") {
    statusCopy = `Missed by ${Math.round(checkpoint.deficitOz)} oz`;
  } else if (checkpoint.status === "missed") {
    statusCopy = `Missed by ${Math.round(checkpoint.deficitOz)} oz`;
  } else if (checkpoint.status === "active") {
    statusCopy =
      checkpoint.deficitOz > 0
        ? `${Math.round(checkpoint.deficitOz)} oz to hit this one`
        : "On track for this checkpoint";
  } else {
    statusCopy = `${checkpoint.targetOz} oz target`;
  }

  return (
    <div className="relative flex gap-3">
      <div className="relative flex w-4 justify-center">
        <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${styles.dot}`} />
        {!isLast && (
          <span className="absolute top-4 h-[calc(100%-0.25rem)] w-px bg-white/10" />
        )}
      </div>

      <div className={`flex-1 rounded-lg border px-3 py-2.5 ${styles.border}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-sm font-semibold ${styles.label}`}>
              {checkpoint.label}
            </p>
            <p className="mt-0.5 text-sm text-slate-300">
              {checkpoint.targetOz} oz
            </p>
          </div>

          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${styles.pill}`}
          >
            {getCheckpointTag(checkpoint.status)}
          </span>
        </div>

        <p className={`mt-1.5 text-xs ${styles.subcopy}`}>{statusCopy}</p>
      </div>
    </div>
  );
}

export default function HydrationPaceCard({
  dailyGoalOz,
  bottleSizeOz,
  currentOz,
  todayEntries,
}: HydrationPaceCardProps) {
  const [currentHour, setCurrentHour] = useState(() => getEasternHour(new Date()));
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentHour(getEasternHour(new Date()));
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const checkpoints = useMemo(() => buildSimplePlan(dailyGoalOz), [dailyGoalOz]);

  const targetNow = useMemo(
    () => getCurrentCheckpointTarget(checkpoints, currentHour),
    [checkpoints, currentHour],
  );

  const pace = useMemo(
    () =>
      getPaceMessage({
        currentOz,
        targetNowOz: targetNow.targetOz,
        bottleSizeOz,
        dailyGoalOz,
      }),
    [bottleSizeOz, currentOz, dailyGoalOz, targetNow.targetOz],
  );

  const evaluatedCheckpoints = useMemo(() => {
    const nowMinutes = getEasternMinutesIntoDay(new Date());

    const base = checkpoints.map((checkpoint) => {
      const checkpointMinutes = checkpoint.hour24 * 60;
      const ouncesByCheckpoint = getOuncesByCheckpoint(checkpoint, todayEntries);
      const deficitOz = Math.max(checkpoint.targetOz - ouncesByCheckpoint, 0);

      let status: CheckpointStatus = "upcoming";

      if (checkpointMinutes < nowMinutes) {
        if (deficitOz <= 0) {
          status = "complete";
        } else {
          const completionRatio =
            checkpoint.targetOz > 0 ? ouncesByCheckpoint / checkpoint.targetOz : 0;
          status = completionRatio >= 0.85 ? "close-missed" : "missed";
        }
      }

      return {
        ...checkpoint,
        ouncesByCheckpoint,
        deficitOz,
        status,
      };
    });

    const activeIndex = base.findIndex((checkpoint) => checkpoint.status === "upcoming");

    if (activeIndex !== -1) {
      base[activeIndex] = {
        ...base[activeIndex],
        status: "active",
      };
    }

    return base;
  }, [checkpoints, todayEntries]);

  const activeCheckpoint =
    evaluatedCheckpoints.find((checkpoint) => checkpoint.status === "active") ??
    evaluatedCheckpoints[evaluatedCheckpoints.length - 1];

  const progressPercent = Math.min(
    (currentOz / Math.max(dailyGoalOz, 1)) * 100,
    100,
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-[#111720] p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        className="flex w-full items-start justify-between gap-4 text-left"
        aria-expanded={isExpanded}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Schedule
          </p>
          <h2 className="mt-1.5 text-lg font-semibold text-white">
            Hydration pace
          </h2>
          <p className="mt-1 text-sm text-slate-300">{pace.message}</p>
          <p className="mt-1 text-xs text-slate-500">
            Focus: {activeCheckpoint.label} · {activeCheckpoint.targetOz} oz
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`hidden rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] sm:inline-flex ${stateStyles[pace.state].badge}`}
          >
            {pace.badge}
          </span>

          <span className="mt-0.5 text-slate-500">
            <svg
              className={`h-5 w-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 7.5 10 12.5 15 7.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </button>

      <div className="mt-4 rounded-xl border border-white/10 bg-[#0b0e13] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Today&apos;s pace
          </p>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] sm:hidden ${stateStyles[pace.state].badge}`}
          >
            {pace.badge}
          </span>
        </div>

        {pace.suggestion ? (
          <p className="mt-1.5 text-xs text-slate-400">{pace.suggestion}</p>
        ) : null}

        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${stateStyles[pace.state].bar}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-500">
            <span>{Math.round(currentOz)} oz logged</span>
            <span>{dailyGoalOz} oz goal</span>
          </div>
        </div>
      </div>

      {isExpanded ? (
        <div className="mt-4 space-y-2.5">
          {evaluatedCheckpoints.map((checkpoint, index) => (
            <CheckpointRow
              key={`${checkpoint.hour24}-${checkpoint.targetOz}`}
              checkpoint={checkpoint}
              isLast={index === evaluatedCheckpoints.length - 1}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}