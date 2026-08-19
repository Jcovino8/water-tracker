/**
 * Hydration Plan Engine
 * ----------------------
 * Converts a user's daily hydration goal + wake/sleep window into:
 *   1. A continuous "expected cumulative intake" curve (front-loaded,
 *      research-informed shape) usable for a live pace indicator.
 *   2. Four discrete checkpoints for an expandable schedule UI.
 *
 * Research basis (baseline, non-workout day):
 * - Vasopressin (fluid-retention hormone) rises through the day, so the
 *   body handles fluid loads better earlier than late in the day.
 * - Observational hydration-timing studies associate front-loaded intake
 *   (~65-70% before mid-afternoon) with better sleep continuity than flat
 *   even-spacing.
 * - Retention studies show fluid absorbed over several hours is retained
 *   far better (~75%) than fluid gulped in a single short bolus (~55%),
 *   so "front-loaded" means weighted-early-but-still-spread-out, not a
 *   single large morning dose.
 * - Last checkpoint is intentionally placed 1 hour before sleep rather
 *   than at sleep time, to avoid encouraging a large pre-bed drink.
 *
 * Extension point for future device/activity integration:
 * The `activityAdjustments` field is reserved for workout-day overrides
 * (pre/during/post-exercise fluid additions) once wearable or manual
 * workout data is available. Baseline logic below does not depend on it.
 */

export type HydrationPlanInput = {
  dailyGoalOz: number;
  wakeTime: string; // "HH:MM", 24-hour, local (Eastern) time
  sleepTime: string; // "HH:MM", 24-hour, local (Eastern) time
  /** Optional future hook: workout-day fluid additions layered on baseline. */
  activityAdjustments?: ActivityHydrationAdjustment[];
};

export type ActivityHydrationAdjustment = {
  /** ISO-ish label for when this adjustment applies, e.g. workout start time. */
  startMinutesFromWake: number;
  durationMinutes: number;
  /** Additional ounces this activity requires, layered on top of baseline curve. */
  additionalOz: number;
  label: string;
};

export type HydrationCheckpoint = {
  /** Fraction of the hydration window (0-1) this checkpoint falls at. */
  fraction: number;
  /** "HH:MM" 24-hour local time this checkpoint occurs. */
  time: string;
  /** Human-readable time, e.g. "10:00 AM". */
  label: string;
  /** Cumulative ounces expected to be logged by this time. */
  targetOz: number;
};

export type HydrationPlan = {
  /** Minutes from wake time to the hydration cutoff (sleep - 60 min). */
  windowMinutes: number;
  /** The 4 schedule checkpoints for expandable UI. */
  checkpoints: HydrationCheckpoint[];
  /** Given a Date (or minutes-from-wake), returns expected cumulative oz. */
  getExpectedOzAt: (now: Date, referenceDate?: Date) => number;
  /** Same as above, but takes minutes elapsed since wake directly. */
  getExpectedOzAtMinutes: (minutesFromWake: number) => number;
};

export type PaceStatus = {
  state: "before-window" | "behind" | "on-pace" | "ahead" | "goal-complete" | "after-window";
  expectedOz: number;
  currentOz: number;
  deltaOz: number; // currentOz - expectedOz; negative = behind
  message: string;
  suggestion: string | null;
};

/** Front-loaded cumulative-fraction control points: [windowFraction, ozFraction]. */
const FRONT_LOADED_CURVE: Array<[number, number]> = [
  [0, 0],
  [0.25, 0.35],
  [0.5, 0.65],
  [0.75, 0.85],
  [1, 1],
];

function parseTimeToMinutes(time: string): number {
  const [hoursText, minutesText] = time.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  return hours * 60 + minutes;
}

function minutesToLabel(totalMinutesFromMidnight: number): string {
  const normalized = ((totalMinutesFromMidnight % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function minutesToHHMM(totalMinutesFromMidnight: number): string {
  const normalized = ((totalMinutesFromMidnight % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/** Piecewise-linear interpolation across the front-loaded control points. */
function cumulativeFractionAt(windowFraction: number): number {
  const clamped = Math.min(Math.max(windowFraction, 0), 1);

  for (let index = 0; index < FRONT_LOADED_CURVE.length - 1; index += 1) {
    const [startFraction, startOzFraction] = FRONT_LOADED_CURVE[index];
    const [endFraction, endOzFraction] = FRONT_LOADED_CURVE[index + 1];

    if (clamped >= startFraction && clamped <= endFraction) {
      const segmentProgress =
        endFraction === startFraction
          ? 0
          : (clamped - startFraction) / (endFraction - startFraction);

      return startOzFraction + segmentProgress * (endOzFraction - startOzFraction);
    }
  }

  return 1;
}

const CHECKPOINT_FRACTIONS = [0.25, 0.5, 0.75, 1];

/**
 * Builds a hydration plan from the user's daily goal and wake/sleep times.
 * The hydration "window" runs from wake time to one hour before sleep time,
 * per the design decision to avoid pushing large volumes right before bed.
 */
export function buildHydrationPlan(input: HydrationPlanInput): HydrationPlan {
  const wakeMinutes = parseTimeToMinutes(input.wakeTime);
  let sleepMinutes = parseTimeToMinutes(input.sleepTime);

  if (sleepMinutes <= wakeMinutes) {
    sleepMinutes += 1440; // Sleep time is past midnight relative to wake.
  }

  const cutoffMinutes = sleepMinutes - 60; // 1 hour before sleep.
  const windowMinutes = Math.max(cutoffMinutes - wakeMinutes, 60); // Guard against negative/tiny windows.

  const checkpoints: HydrationCheckpoint[] = CHECKPOINT_FRACTIONS.map((fraction) => {
    const minutesFromWake = fraction * windowMinutes;
    const absoluteMinutes = wakeMinutes + minutesFromWake;
    const ozFraction = cumulativeFractionAt(fraction);

    return {
      fraction,
      time: minutesToHHMM(absoluteMinutes),
      label: minutesToLabel(absoluteMinutes),
      targetOz: Math.round(ozFraction * input.dailyGoalOz),
    };
  });

  function getExpectedOzAtMinutes(minutesFromWake: number): number {
    if (minutesFromWake <= 0) {
      return 0;
    }

    if (minutesFromWake >= windowMinutes) {
      return input.dailyGoalOz;
    }

    const windowFraction = minutesFromWake / windowMinutes;
    const baselineOz = cumulativeFractionAt(windowFraction) * input.dailyGoalOz;

    const activityBonus = (input.activityAdjustments ?? []).reduce((total, adjustment) => {
      const adjustmentEnd = adjustment.startMinutesFromWake + adjustment.durationMinutes;

      if (minutesFromWake >= adjustmentEnd) {
        return total + adjustment.additionalOz;
      }

      if (minutesFromWake > adjustment.startMinutesFromWake) {
        const progress =
          (minutesFromWake - adjustment.startMinutesFromWake) / adjustment.durationMinutes;
        return total + adjustment.additionalOz * progress;
      }

      return total;
    }, 0);

    return Math.round(baselineOz + activityBonus);
  }

  function getExpectedOzAt(now: Date, referenceDate: Date = now): number {
    const nowMinutesFromMidnight = now.getHours() * 60 + now.getMinutes();
    let minutesFromWake = nowMinutesFromMidnight - wakeMinutes;

    // Handle wake times that roll past midnight relative to "now".
    if (minutesFromWake < -720) {
      minutesFromWake += 1440;
    }

    void referenceDate; // Reserved for future multi-day-aware calculations.

    return getExpectedOzAtMinutes(minutesFromWake);
  }

  return {
    windowMinutes,
    checkpoints,
    getExpectedOzAt,
    getExpectedOzAtMinutes,
  };
}

/**
 * Computes a live pace status by comparing the user's current ounces
 * logged today against the plan's expected cumulative ounces right now.
 */
export function getPaceStatus(params: {
  plan: HydrationPlan;
  currentOz: number;
  dailyGoalOz: number;
  now: Date;
  wakeTime: string;
  sleepTime: string;
  bottleSizeOz: number;
}): PaceStatus {
  const { plan, currentOz, dailyGoalOz, now, wakeTime, sleepTime, bottleSizeOz } = params;

  const wakeMinutes = parseTimeToMinutes(wakeTime);
  let sleepMinutes = parseTimeToMinutes(sleepTime);

  if (sleepMinutes <= wakeMinutes) {
    sleepMinutes += 1440;
  }

  const nowMinutesFromMidnight = now.getHours() * 60 + now.getMinutes();
  let minutesFromWake = nowMinutesFromMidnight - wakeMinutes;

  if (minutesFromWake < -720) {
    minutesFromWake += 1440;
  }

  if (currentOz >= dailyGoalOz) {
    const surplus = Math.round(currentOz - dailyGoalOz);

    return {
      state: "goal-complete",
      expectedOz: dailyGoalOz,
      currentOz,
      deltaOz: surplus,
      message:
        surplus > 0
          ? `Goal complete — ${surplus} oz above target.`
          : "Goal complete for today.",
      suggestion: null,
    };
  }

  if (minutesFromWake < 0) {
    return {
      state: "before-window",
      expectedOz: 0,
      currentOz,
      deltaOz: currentOz,
      message: "Hydration window hasn't started yet.",
      suggestion: null,
    };
  }

  if (minutesFromWake >= plan.windowMinutes) {
    const deltaOz = Math.round(currentOz - dailyGoalOz);

    return {
      state: "after-window",
      expectedOz: dailyGoalOz,
      currentOz,
      deltaOz,
      message:
        deltaOz < 0
          ? `${Math.abs(deltaOz)} oz short of today's goal.`
          : "On track for today.",
      suggestion:
        deltaOz < 0
          ? `Log a ${bottleSizeOz} oz bottle to close the gap.`
          : null,
    };
  }

  const expectedOz = plan.getExpectedOzAtMinutes(minutesFromWake);
  const deltaOz = Math.round(currentOz - expectedOz);
  const toleranceOz = Math.max(4, Math.round(dailyGoalOz * 0.04));

  if (deltaOz < -toleranceOz) {
    const behindBy = Math.abs(deltaOz);

    return {
      state: "behind",
      expectedOz,
      currentOz,
      deltaOz,
      message: `${behindBy} oz behind pace.`,
      suggestion: `Log a ${bottleSizeOz} oz bottle to catch up.`,
    };
  }

  if (deltaOz > toleranceOz) {
    return {
      state: "ahead",
      expectedOz,
      currentOz,
      deltaOz,
      message: `${deltaOz} oz ahead of pace.`,
      suggestion: null,
    };
  }

  return {
    state: "on-pace",
    expectedOz,
    currentOz,
    deltaOz,
    message: "Right on pace.",
    suggestion: null,
  };
}
