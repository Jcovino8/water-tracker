"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { HydrationPaceCard } from "@/components/HydrationPaceCard";
import TopNav from "@/components/top-nav";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { browserSupabase } from "@/lib/supabase-browser";

const defaultDailyGoalOz = 96;
const defaultBottleSizeOz = 25;
const commonBottleSizes = [16.9, 20, 25];
const earliestHistoryMonth = "2026-08";

const quickDrinkPresets = [
  { key: "coffee", name: "Black coffee", amountOz: 8 },
  { key: "espresso", name: "Espresso", amountOz: 2 },
  { key: "seltzer", name: "Seltzer", amountOz: 12 },
  { key: "sparkling-water", name: "Sparkling water", amountOz: 16.9 },
  { key: "green-tea", name: "Green tea", amountOz: 12 },
] as const;

type WaterEntry = {
  id: string;
  created_at: string;
  amount_oz: number;
  source: "nfc" | "manual";
  bottle_name: string;
};

type FavoriteDrink = {
  key: string;
  name: string;
  amountOz: number;
};

type TrackerSettings = {
  dailyGoalOz: number;
  bottleSizeOz: number;
  favoriteDrinks: FavoriteDrink[];
};

type TrackerSettingsApiResponse = {
  daily_goal_oz: number;
  bottle_size_oz: number;
  favorite_drinks?: FavoriteDrink[] | null;
  updated_at: string;
};

type ProfileApiResponse = {
  profile?: {
    display_name?: string | null;
    username?: string | null;
  } | null;
};

type SnapshotMode = "7-day" | "monthly";

type TrendDay = {
  dateKey: string;
  label: string;
  fullLabel: string;
  ounces: number;
  isToday: boolean;
  xLabel: string;
};

type CalendarDay = {
  dateKey: string;
  dayNumber: number;
  ounces: number;
  isToday: boolean;
  isCurrentMonth: boolean;
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

function getEasternMonthKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return `${year}-${month}`;
}

function parseMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, month };
}

function formatMonthLabel(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1, 12, 0, 0));
}

function getPreviousMonthKey(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  const date = new Date(year, month - 2, 1, 12, 0, 0);
  return getEasternMonthKey(date);
}

function getNextMonthKey(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  const date = new Date(year, month, 1, 12, 0, 0);
  return getEasternMonthKey(date);
}

function isFutureMonth(monthKey: string) {
  return monthKey > getEasternMonthKey(new Date());
}

function getDaysInMonth(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  return new Date(year, month, 0).getDate();
}

function getMonthGrid(monthKey: string, ouncesByEasternDate: Record<string, number>, todayEastern: string) {
  const { year, month } = parseMonthKey(monthKey);
  const firstDay = new Date(year, month - 1, 1, 12, 0, 0);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = getDaysInMonth(monthKey);

  const cells: CalendarDay[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({
      dateKey: `blank-start-${index}`,
      dayNumber: 0,
      ounces: 0,
      isToday: false,
      isCurrentMonth: false,
    });
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = new Date(year, month - 1, dayNumber, 12, 0, 0);
    const dateKey = getEasternDateKey(date);

    cells.push({
      dateKey,
      dayNumber,
      ounces: ouncesByEasternDate[dateKey] ?? 0,
      isToday: dateKey === todayEastern,
      isCurrentMonth: true,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      dateKey: `blank-end-${cells.length}`,
      dayNumber: 0,
      ounces: 0,
      isToday: false,
      isCurrentMonth: false,
    });
  }

  return cells;
}

function normalizeSettings(settings: TrackerSettingsApiResponse): TrackerSettings {
  const favoriteDrinks = Array.isArray(settings.favorite_drinks)
    ? settings.favorite_drinks
        .map((drink) => ({
          key: String(drink.key),
          name: String(drink.name),
          amountOz: Number(drink.amountOz),
        }))
        .filter(
          (drink) =>
            drink.key.trim().length > 0 &&
            drink.name.trim().length > 0 &&
            Number.isFinite(drink.amountOz) &&
            drink.amountOz > 0,
        )
    : [];

  return {
    dailyGoalOz: Number(settings.daily_goal_oz),
    bottleSizeOz: Number(settings.bottle_size_oz),
    favoriteDrinks,
  };
}

function greetingForCurrentTime() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function calculateCurrentStreak(
  days: TrendDay[],
  dailyGoalOz: number,
  todayKey: string,
) {
  let streak = 0;
  const latestDay = days[days.length - 1];
  const startIndex =
    latestDay?.dateKey === todayKey && latestDay.ounces < dailyGoalOz
      ? days.length - 2
      : days.length - 1;

  for (let index = startIndex; index >= 0; index -= 1) {
    if (days[index].ounces < dailyGoalOz) break;
    streak += 1;
  }

  return streak;
}

function formatOunces(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildChartTicks(maxValue: number) {
  const roughStep = maxValue <= 160 ? 40 : maxValue <= 240 ? 50 : 100;
  const top = Math.ceil(maxValue / roughStep) * roughStep;

  const ticks: number[] = [];
  for (let value = 0; value <= top; value += roughStep) {
    ticks.push(value);
  }

  return { top, ticks };
}

function slugifyDrinkKey(name: string, amountOz: number) {
  return `${name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}-${String(amountOz).replace(".", "-")}`;
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

function TrendTooltip({
  active,
  payload,
  dailyGoalOz,
}: {
  active?: boolean;
  payload?: Array<{ payload: TrendDay }>;
  dailyGoalOz: number;
}) {
  if (!active || !payload?.[0]) return null;

  const day = payload[0].payload;
  const metGoal = day.ounces >= dailyGoalOz;

  return (
    <div className="rounded-xl border border-white/10 bg-[#151a22] px-3 py-2.5 shadow-2xl">
      <p className="text-xs font-medium text-slate-400">{day.fullLabel}</p>
      <p className="mt-1 text-lg font-semibold text-white">{day.ounces} oz</p>
      <p className={`mt-0.5 text-xs ${metGoal ? "text-emerald-300" : "text-slate-400"}`}>
        {metGoal
          ? "Goal reached"
          : `${Math.max(Math.round(dailyGoalOz - day.ounces), 0)} oz below goal`}
      </p>
    </div>
  );
}

function CustomDot(props: {
  cx?: number;
  cy?: number;
  payload?: TrendDay;
}) {
  const { cx, cy, payload } = props;

  if (typeof cx !== "number" || typeof cy !== "number") return null;

  const isToday = payload?.isToday;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={isToday ? 5 : 3}
      fill={isToday ? "#ffffff" : "#0b0e13"}
      stroke="#67e8f9"
      strokeWidth={isToday ? 3 : 2}
    />
  );
}

function DayProgressDonut({
  ounces,
  goalOz,
  isToday,
}: {
  ounces: number;
  goalOz: number;
  isToday: boolean;
}) {
  if (ounces <= 0) return null;

  const ratio = Math.min(ounces / Math.max(goalOz, 1), 1);
  const size = 60;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const metGoal = ounces >= goalOz;

  return (
    <div className="relative flex h-[60px] w-[60px] items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={metGoal ? "#34d399" : "#7dd3fc"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>

      {metGoal ? (
        <div
          className={`absolute inset-[10px] rounded-full bg-emerald-400 ${
            isToday ? "ring-2 ring-emerald-200/70" : ""
          }`}
        />
      ) : (
        <div
          className={`absolute rounded-full bg-[#0b0e13] ${
            isToday ? "ring-2 ring-sky-200/60" : ""
          }`}
          style={{
            width: `${Math.max(12, 28 - ratio * 14)}px`,
            height: `${Math.max(12, 28 - ratio * 14)}px`,
          }}
        />
      )}
    </div>
  );
}

export default function Home() {
  const [entries, setEntries] = useState<WaterEntry[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [manualAmountOz, setManualAmountOz] = useState(String(defaultBottleSizeOz));
  const [manualDrinkName, setManualDrinkName] = useState("");
  const [isQuickSelectOpen, setIsQuickSelectOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [snapshotMode, setSnapshotMode] = useState<SnapshotMode>("7-day");
  const [selectedMonthKey, setSelectedMonthKey] = useState(() =>
    getEasternMonthKey(new Date()),
  );

  const [settings, setSettings] = useState<TrackerSettings>({
    dailyGoalOz: defaultDailyGoalOz,
    bottleSizeOz: defaultBottleSizeOz,
    favoriteDrinks: [],
  });

  const [draftSettings, setDraftSettings] = useState<TrackerSettings>({
    dailyGoalOz: defaultDailyGoalOz,
    bottleSizeOz: defaultBottleSizeOz,
    favoriteDrinks: [],
  });

  const loadDashboardData = useCallback(
    async (
      token: string,
      options?: {
        mode?: SnapshotMode;
        monthKey?: string;
      },
    ) => {
      const mode = options?.mode ?? snapshotMode;
      const monthKey = options?.monthKey ?? selectedMonthKey;
      const entriesPath =
        mode === "monthly"
          ? `/api/water-log?month=${monthKey}`
          : "/api/water-log?days=7";

      const [entriesResponse, settingsResponse, profileResponse] = await Promise.all([
        authorizedFetch(entriesPath, token),
        authorizedFetch("/api/tracker-settings", token),
        authorizedFetch("/api/profile", token),
      ]);

      if (!entriesResponse.ok || !settingsResponse.ok) {
        throw new Error("Unable to load tracker data.");
      }

      const entriesData = await entriesResponse.json();
      const settingsData = await settingsResponse.json();
      const loadedSettings = normalizeSettings(settingsData.settings);

      setEntries(Array.isArray(entriesData.entries) ? entriesData.entries : []);
      setSettings(loadedSettings);
      setDraftSettings(loadedSettings);

      if (profileResponse.ok) {
        const profileData = (await profileResponse.json()) as ProfileApiResponse;
        const profile = profileData.profile;
        setDisplayName(profile?.display_name?.trim() || profile?.username?.trim() || "");
      }
    },
    [selectedMonthKey, snapshotMode],
  );

  useEffect(() => {
    let isMounted = true;
    let loadingTimeout: number | undefined;

    async function initializeDashboard() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await browserSupabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session) {
          window.location.replace("/login");
          return;
        }

        if (!isMounted) return;

        setAccessToken(session.access_token);
        setUserId(session.user.id);
        await loadDashboardData(session.access_token, {
          mode: snapshotMode,
          monthKey: selectedMonthKey,
        });
      } catch (error) {
        console.error("Dashboard initialization failed:", error);
        if (isMounted) {
          setErrorMessage("Could not load your hydration data. Please refresh and try again.");
        }
      } finally {
        if (isMounted) {
          window.clearTimeout(loadingTimeout);
          setIsLoading(false);
        }
      }
    }

    loadingTimeout = window.setTimeout(() => {
      if (!isMounted) return;
      setErrorMessage("The dashboard took too long to load. Please refresh and try again.");
      setIsLoading(false);
    }, 10000);

    void initializeDashboard();

    return () => {
      isMounted = false;
      if (loadingTimeout) window.clearTimeout(loadingTimeout);
    };
  }, [loadDashboardData, selectedMonthKey, snapshotMode]);

  useEffect(() => {
    if (!userId || !accessToken) return;

    const channel = browserSupabase
      .channel(`water-entries:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "water_entries",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadDashboardData(accessToken, {
            mode: snapshotMode,
            monthKey: selectedMonthKey,
          });
        },
      )
      .subscribe((status) => {
        console.log("Water-entries Realtime status:", status);
      });

    return () => {
      void browserSupabase.removeChannel(channel);
    };
  }, [accessToken, loadDashboardData, selectedMonthKey, snapshotMode, userId]);

  const todayEastern = getEasternDateKey(new Date());
  const todayMonthKey = getEasternMonthKey(new Date());

  const todayEntries = entries.filter(
    (entry) => getEasternDateKey(entry.created_at) === todayEastern,
  );

  const currentOz = todayEntries.reduce(
    (total, entry) => total + Number(entry.amount_oz),
    0,
  );

  const remainingOz = Math.max(Math.round(settings.dailyGoalOz - currentOz), 0);
  const overGoalOz = Math.max(Math.round(currentOz - settings.dailyGoalOz), 0);
  const progressPercent = Math.min(
    Math.round((currentOz / settings.dailyGoalOz) * 100),
    100,
  );

  const ouncesByEasternDate = entries.reduce<Record<string, number>>((totals, entry) => {
    const entryDateKey = getEasternDateKey(entry.created_at);
    totals[entryDateKey] = (totals[entryDateKey] ?? 0) + Number(entry.amount_oz);
    return totals;
  }, {});

  const todayDate = new Date();

  const weeklyDays: TrendDay[] = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(todayDate);
    day.setDate(todayDate.getDate() - (6 - index));

    const dateKey = getEasternDateKey(day);

    return {
      dateKey,
      label: new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "narrow",
      }).format(day),
      fullLabel: new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(day),
      ounces: ouncesByEasternDate[dateKey] ?? 0,
      isToday: dateKey === todayEastern,
      xLabel: `${dateKey}-${new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "narrow",
      }).format(day)}`,
    };
  });

  const monthlyCalendarDays = useMemo(() => {
    return getMonthGrid(selectedMonthKey, ouncesByEasternDate, todayEastern);
  }, [ouncesByEasternDate, selectedMonthKey, todayEastern]);

  const monthlyActiveDays = useMemo(() => {
    return monthlyCalendarDays.filter((day) => day.isCurrentMonth);
  }, [monthlyCalendarDays]);

  const snapshotDays = snapshotMode === "monthly" ? monthlyActiveDays : weeklyDays;
  const snapshotLabel = snapshotMode === "monthly" ? "Monthly snapshot" : "7 day snapshot";
  const snapshotSubcopy =
    snapshotMode === "monthly"
      ? `Calendar view for ${formatMonthLabel(selectedMonthKey)}. Each day fills toward your ${settings.dailyGoalOz} oz goal.`
      : `Daily intake against your ${settings.dailyGoalOz} oz target over the last 7 days.`;

  const snapshotTotalOz = snapshotDays.reduce((total, day) => total + day.ounces, 0);
  const snapshotAverageOz = Math.round(
    snapshotTotalOz / Math.max(snapshotDays.length, 1),
  );
  const snapshotGoalHitCount = snapshotDays.filter(
    (day) => day.ounces >= settings.dailyGoalOz,
  ).length;
  const bestDay = snapshotDays.reduce(
    (best, day) => (day.ounces > best.ounces ? day : best),
    snapshotDays[0],
  );

  const currentStreak =
    snapshotMode === "7-day"
      ? calculateCurrentStreak(weeklyDays, settings.dailyGoalOz, todayEastern)
      : 0;

  const chartMaximum = Math.max(
    settings.dailyGoalOz,
    ...weeklyDays.map((day) => day.ounces),
  );

  const { top: chartTop, ticks: chartTicks } = buildChartTicks(
    Math.ceil(chartMaximum * 1.15),
  );

  const greeting = displayName
    ? `${greetingForCurrentTime()}, ${displayName}`
    : greetingForCurrentTime();

  const progressCopy =
    currentOz >= settings.dailyGoalOz
      ? `Daily target complete — ${currentOz} oz logged.`
      : remainingOz <= settings.bottleSizeOz
        ? "One more bottle gets you to your target."
        : `${remainingOz} oz to go for today.`;

  const insightCopy =
    snapshotMode === "monthly"
      ? snapshotAverageOz >= settings.dailyGoalOz
        ? `Your ${formatMonthLabel(selectedMonthKey)} average is ${snapshotAverageOz} oz per day — ${snapshotAverageOz - settings.dailyGoalOz} oz above target.`
        : `Your ${formatMonthLabel(selectedMonthKey)} average is ${snapshotAverageOz} oz per day — ${settings.dailyGoalOz - snapshotAverageOz} oz below target.`
      : snapshotGoalHitCount === 7
        ? "Perfect week so far. You have reached your target every day."
        : snapshotAverageOz >= settings.dailyGoalOz
          ? `You are averaging ${snapshotAverageOz} oz per day — ${snapshotAverageOz - settings.dailyGoalOz} oz above target.`
          : `Your 7-day average is ${snapshotAverageOz} oz — ${settings.dailyGoalOz - snapshotAverageOz} oz below target.`;

  const manualAmount = Number(manualAmountOz);
  const trimmedManualDrinkName = (manualDrinkName ?? "").trim();
  const canLogManualAmount =
    Number.isFinite(manualAmount) && manualAmount > 0 && manualAmount <= 512;

  const favoriteDrinkPresets = useMemo(() => {
    return settings.favoriteDrinks.map((drink) => ({
      key: drink.key,
      name: drink.name,
      amountOz: drink.amountOz,
    }));
  }, [settings.favoriteDrinks]);

  const quickLogSizes = useMemo(() => {
    const sizeButtons = Array.from(new Set([...commonBottleSizes, settings.bottleSizeOz]))
      .sort((a, b) => a - b)
      .map((size) => ({
        type: "size" as const,
        key: `size-${size}`,
        label: `${formatOunces(size)} oz${size === settings.bottleSizeOz ? " · My bottle" : ""}`,
        amountOz: size,
      }));

    const favoriteButtons = favoriteDrinkPresets.map((drink) => ({
      type: "favorite-drink" as const,
      key: `favorite-${drink.key}`,
      label: `${drink.name} · ${formatOunces(drink.amountOz)} oz`,
      amountOz: drink.amountOz,
      drinkName: drink.name,
      drinkKey: drink.key,
    }));

    return [...sizeButtons, ...favoriteButtons];
  }, [favoriteDrinkPresets, settings.bottleSizeOz]);

  const collapsibleQuickDrinks = useMemo(() => {
    const favoriteKeys = new Set(settings.favoriteDrinks.map((drink) => drink.key));
    return quickDrinkPresets.filter((drink) => !favoriteKeys.has(drink.key));
  }, [settings.favoriteDrinks]);

  async function persistFavoriteDrinks(nextFavoriteDrinks: FavoriteDrink[]) {
    if (!accessToken) return;

    setIsSavingFavorite(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await authorizedFetch("/api/tracker-settings", accessToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyGoalOz: Number(settings.dailyGoalOz),
          bottleSizeOz: Number(settings.bottleSizeOz),
          favoriteDrinks: nextFavoriteDrinks.map((drink) => ({
            key: drink.key,
            name: drink.name,
            amountOz: drink.amountOz,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Unable to save favorite drinks.");
      }

      const data = await response.json();
      const updatedSettings = normalizeSettings(data.settings);
      setSettings(updatedSettings);
      setDraftSettings(updatedSettings);
      setStatusMessage(
        nextFavoriteDrinks.length > settings.favoriteDrinks.length
          ? "Drink added to favorites."
          : "Favorite drink removed.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save favorite drinks.",
      );
    } finally {
      setIsSavingFavorite(false);
    }
  }

  async function removeFavoriteDrink(drinkKey: string) {
    await persistFavoriteDrinks(
      settings.favoriteDrinks.filter((drink) => drink.key !== drinkKey),
    );
  }

  async function logManualBottle(
    override?: {
      amountOz?: number;
      bottleName?: string;
      clearCustomDrink?: boolean;
    },
  ) {
    const amountToLog = override?.amountOz ?? manualAmount;
    const bottleName =
      override?.bottleName ??
      (trimmedManualDrinkName.length > 0 ? trimmedManualDrinkName : "Manual entry");

    if (
      !accessToken ||
      !Number.isFinite(amountToLog) ||
      amountToLog <= 0 ||
      amountToLog > 512
    ) {
      setErrorMessage("Enter an amount between 0.1 and 512 oz.");
      return;
    }

    setIsSavingEntry(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await authorizedFetch("/api/water-log", accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountOz: amountToLog,
          source: "manual",
          bottleName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save water entry.");
      }

      setStatusMessage("Hydration logged.");
      if (override?.clearCustomDrink) {
        setManualDrinkName("");
      }
      await loadDashboardData(accessToken, {
        mode: snapshotMode,
        monthKey: selectedMonthKey,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save hydration entry.",
      );
    } finally {
      setIsSavingEntry(false);
    }
  }

  async function favoriteTypedDrink() {
    if (!trimmedManualDrinkName || !canLogManualAmount) {
      setErrorMessage("Enter a drink name and a valid ounce amount to favorite it.");
      return;
    }

    const nextFavorite = {
      key: slugifyDrinkKey(trimmedManualDrinkName, manualAmount),
      name: trimmedManualDrinkName,
      amountOz: Number(manualAmount.toFixed(1)),
    };

    await persistFavoriteDrinks([
      ...settings.favoriteDrinks.filter((drink) => drink.key !== nextFavorite.key),
      nextFavorite,
    ]);
  }

  async function deleteEntry(entryId: string) {
    if (!accessToken) return;

    setIsDeleting(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await authorizedFetch(
        `/api/water-log?id=${entryId}`,
        accessToken,
        { method: "DELETE" },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to delete water entry.");
      }

      setEntries((currentEntries) =>
        currentEntries.filter((entry) => entry.id !== entryId),
      );
      setStatusMessage("Entry removed.");
      await loadDashboardData(accessToken, {
        mode: snapshotMode,
        monthKey: selectedMonthKey,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete this entry.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    setIsSavingSettings(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await authorizedFetch("/api/tracker-settings", accessToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyGoalOz: Number(draftSettings.dailyGoalOz),
          bottleSizeOz: Number(draftSettings.bottleSizeOz),
          favoriteDrinks: draftSettings.favoriteDrinks.map((drink) => ({
            key: drink.key,
            name: drink.name,
            amountOz: drink.amountOz,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Unable to save settings.");
      }

      const data = await response.json();
      const updatedSettings = normalizeSettings(data.settings);
      setSettings(updatedSettings);
      setDraftSettings(updatedSettings);
      setManualAmountOz(String(updatedSettings.bottleSizeOz));
      setIsSettingsOpen(false);
      setStatusMessage("Tracker settings saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save tracker settings.",
      );
    } finally {
      setIsSavingSettings(false);
    }
  }

  function cancelSettings() {
    setDraftSettings(settings);
    setIsSettingsOpen(false);
  }

  async function signOut() {
    await browserSupabase.auth.signOut();
    window.location.replace("/login");
  }

  async function switchSnapshotMode(nextMode: SnapshotMode) {
    setSnapshotMode(nextMode);

    if (!accessToken) return;

    setErrorMessage("");
    await loadDashboardData(accessToken, {
      mode: nextMode,
      monthKey: selectedMonthKey,
    });
  }

  async function jumpMonth(direction: "previous" | "next") {
    const nextMonthKey =
      direction === "previous"
        ? getPreviousMonthKey(selectedMonthKey)
        : getNextMonthKey(selectedMonthKey);

    if (isFutureMonth(nextMonthKey) || nextMonthKey < earliestHistoryMonth) return;

    setSelectedMonthKey(nextMonthKey);

    if (!accessToken) return;

    setErrorMessage("");
    await loadDashboardData(accessToken, {
      mode: "monthly",
      monthKey: nextMonthKey,
    });
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0e13] px-5 text-slate-400">
        Checking secure session…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0e13] px-4 py-6 text-slate-100 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.9)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Tally
              </p>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {greeting}
            </h1>
            <p className="mt-2 text-sm text-slate-400">{formatToday()}</p>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-slate-400 transition hover:border-white/20 hover:text-white"
          >
            Sign out
          </button>
        </header>

        <TopNav />

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#161c26] via-[#111720] to-[#0d1219] shadow-2xl shadow-black/25">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <div>
              <p className="text-sm font-medium text-slate-400">Today&apos;s hydration</p>
              <div className="mt-3 flex items-end gap-3">
                <p className="text-6xl font-semibold tracking-[-0.06em] text-white sm:text-7xl">
                  {currentOz}
                </p>
                <p className="mb-2 text-xl font-medium text-slate-500">oz</p>
              </div>
              <p className="mt-4 text-sm text-slate-300">{progressCopy}</p>

              <div className="mt-7">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-300 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="mt-3 flex justify-between text-xs font-medium text-slate-500">
                  <span>{progressPercent}% of target</span>
                  <span>{settings.dailyGoalOz} oz goal</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] p-5 lg:mb-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/80">
                Today&apos;s total
              </p>
              {currentOz >= settings.dailyGoalOz ? (
                <>
                  <p className="mt-3 text-3xl font-semibold text-emerald-300">Goal complete</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {overGoalOz > 0
                      ? `${overGoalOz} oz above your daily target.`
                      : "You reached your daily target exactly."}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-3xl font-semibold text-white">{remainingOz} oz</p>
                  <p className="mt-1 text-sm text-slate-400">remaining to hit your goal</p>
                </>
              )}
            </div>
          </div>
        </section>

        <div className="mt-5">
          <HydrationPaceCard
            dailyGoalOz={settings.dailyGoalOz}
            bottleSizeOz={settings.bottleSizeOz}
            currentOz={currentOz}
          />
        </div>

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              Goal days
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {snapshotGoalHitCount}
              <span className="text-sm text-slate-500">
                /{snapshotMode === "monthly" ? snapshotDays.length : 7}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#111720] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {snapshotMode === "monthly" ? "Monthly total" : "Goal streak"}
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
              Best day
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {bestDay?.ounces ?? 0}
              <span className="ml-1 text-sm text-slate-500">oz</span>
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                Snapshot
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">{snapshotLabel}</h2>
              <p className="mt-1 text-sm text-slate-400">{snapshotSubcopy}</p>
            </div>

            <div className="flex flex-col gap-3 sm:items-end">
              <div className="inline-flex rounded-lg border border-white/10 bg-[#0b0e13] p-1">
                <button
                  type="button"
                  onClick={() => void switchSnapshotMode("7-day")}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    snapshotMode === "7-day"
                      ? "bg-cyan-300 text-[#071015]"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  7 day
                </button>
                <button
                  type="button"
                  onClick={() => void switchSnapshotMode("monthly")}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    snapshotMode === "monthly"
                      ? "bg-cyan-300 text-[#071015]"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  Monthly snapshot
                </button>
              </div>

              {snapshotMode === "monthly" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void jumpMonth("previous")}
                    disabled={selectedMonthKey <= earliestHistoryMonth}
                    className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ←
                  </button>
                  <div className="min-w-[180px] rounded-lg border border-white/10 px-4 py-2 text-center text-sm font-semibold text-white">
                    {formatMonthLabel(selectedMonthKey)}
                  </div>
                  <button
                    type="button"
                    onClick={() => void jumpMonth("next")}
                    disabled={selectedMonthKey === todayMonthKey}
                    className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          </div>

          {snapshotMode === "7-day" ? (
            <div className="mt-6 h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyDays} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hydrationArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.38} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#ffffff" strokeOpacity={0.07} />
                  <XAxis
                    dataKey="dateKey"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#7f8aa0", fontSize: 12 }}
                    dy={10}
                    tickFormatter={(value) =>
                      new Intl.DateTimeFormat("en-US", {
                        timeZone: "America/New_York",
                        weekday: "narrow",
                      }).format(new Date(`${value}T12:00:00`))
                    }
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#7f8aa0", fontSize: 11 }}
                    domain={[0, chartTop]}
                    ticks={chartTicks}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ stroke: "#67e8f9", strokeWidth: 1, strokeOpacity: 0.45 }}
                    content={<TrendTooltip dailyGoalOz={settings.dailyGoalOz} />}
                  />
                  <ReferenceLine
                    y={settings.dailyGoalOz}
                    stroke="#fbbf24"
                    strokeDasharray="5 5"
                    strokeOpacity={0.85}
                    label={{
                      value: "Goal",
                      fill: "#fcd34d",
                      fontSize: 11,
                      position: "insideTopRight",
                    }}
                  />
                  <Area
                    type="linear"
                    dataKey="ounces"
                    stroke="#22d3ee"
                    strokeWidth={3}
                    fill="url(#hydrationArea)"
                    activeDot={{ r: 5, fill: "#ffffff", stroke: "#22d3ee", strokeWidth: 3 }}
                    dot={<CustomDot />}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-6">
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                  <div key={label} className="py-1">
                    {label}
                  </div>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-2">
                {monthlyCalendarDays.map((day) => (
                  <div
                    key={day.dateKey}
                    className={`min-h-[84px] rounded-xl border p-2 ${
                      day.isCurrentMonth
                        ? day.isToday
                          ? "border-cyan-300/40 bg-cyan-/[0.05]"
                          : "border-white/10 white/10"
                        : "border-transparent bg-transparent"
                    }`}
                  >
                    {day.isCurrentMonth && (
                      <div className="flex h-full flex-col">
                        <div className="flex items-start justify-between">
                          <span
                            className={`text-xs font-semibold ${
                              day.isToday ? "text-cyan-200" : "text-slate-400"
                            }`}
                          >
                            {day.dayNumber}
                          </span>
                          {day.ounces > 0 && (
                            <span className="text-[10px] font-medium text-slate-500">
                              {formatOunces(day.ounces)} oz
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex flex-1 items-center justify-center">
                          <DayProgressDonut
                            ounces={day.ounces}
                            goalOz={settings.dailyGoalOz}
                            isToday={day.isToday}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-sky-300" />
                  <span>Partial progress</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-emerald-400" />
                  <span>Goal reached</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full border border-white/20 bg-transparent" />
                  <span>No log</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/80">
            Hydration insight
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{insightCopy}</p>
        </section>

        <section className="mt-5 rounded-2xl border border-cyan-300/15 bg-[#111720] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                Manual log
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Add hydration</h2>
              <p className="mt-1 text-sm text-slate-400">
                Log any amount when you finish a bottle, cup, or refill.
              </p>
            </div>
            <p className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-400">
              Your bottle: {settings.bottleSizeOz} oz
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {quickLogSizes.map((item) => {
              if (item.type === "favorite-drink") {
                return (
                  <div
                    key={item.key}
                    className="flex items-center overflow-hidden rounded-lg border border-cyan-300/30 bg-cyan-300/[0.08]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setManualDrinkName(item.drinkName);
                        setManualAmountOz(String(item.amountOz));
                      }}
                      className="px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.08]"
                    >
                      {item.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeFavoriteDrink(item.drinkKey)}
                      disabled={isSavingFavorite || !accessToken}
                      className="border-l border-cyan-300/20 px-2.5 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-300/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`Remove favorite ${item.drinkName}`}
                    >
                      ★
                    </button>
                  </div>
                );
              }

              const isSelected =
                Number(manualAmountOz) === item.amountOz && !trimmedManualDrinkName;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setManualAmountOz(String(item.amountOz));
                    setManualDrinkName("");
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    isSelected
                      ? "border-cyan-300 bg-cyan-300 text-[#071015]"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-[1.2]">
              <span className="sr-only">Drink name</span>
              <input
                type="text"
                maxLength={80}
                value={manualDrinkName}
                onChange={(event) => setManualDrinkName(event.target.value)}
                placeholder="Drink name (optional)"
                className="w-full rounded-lg border border-white/10 bg-[#0b0e13] px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                aria-label="Drink name"
              />
            </label>

            <label className="relative flex-1">
              <span className="sr-only">Custom ounces</span>
              <input
                type="number"
                min="0.1"
                max="512"
                step="0.1"
                value={manualAmountOz}
                onChange={(event) => setManualAmountOz(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0b0e13] px-4 py-3 pr-12 text-lg font-semibold text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                aria-label="Custom ounces"
              />
              <span className="pointer-events-none absolute right-4 top-3.5 text-sm font-medium text-slate-500">
                oz
              </span>
            </label>

            <button
              type="button"
              onClick={() =>
                void logManualBottle({
                  clearCustomDrink: trimmedManualDrinkName.length > 0,
                })
              }
              disabled={isSavingEntry || !accessToken || !canLogManualAmount}
              className="rounded-lg bg-cyan-300 px-6 py-3 text-sm font-bold text-[#071015] transition hover:bg-cyan-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingEntry ? "Logging…" : `Log ${canLogManualAmount ? formatOunces(manualAmount) : ""} oz`}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIsQuickSelectOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
              aria-expanded={isQuickSelectOpen}
            >
              <span>{isQuickSelectOpen ? "Hide quick select drinks" : "Quick select drinks"}</span>
              <span className="text-xs text-slate-500">{isQuickSelectOpen ? "−" : "+"}</span>
            </button>

            <button
              type="button"
              onClick={() => void favoriteTypedDrink()}
              disabled={
                isSavingFavorite ||
                !accessToken ||
                !trimmedManualDrinkName ||
                !canLogManualAmount
              }
              className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Favorite typed drink
            </button>
          </div>

          {isQuickSelectOpen && (
            <div className="mt-4 rounded-xl border border-white/10 bg-[#0b0e13] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Quick select
                </p>
                {isSavingFavorite && (
                  <span className="text-xs text-slate-500">Saving favorite…</span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {collapsibleQuickDrinks.map((drink) => (
                  <div
                    key={drink.key}
                    className="flex items-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setManualDrinkName(drink.name);
                        setManualAmountOz(String(drink.amountOz));
                      }}
                      disabled={isSavingEntry || !accessToken}
                      className="px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {drink.name} · {formatOunces(drink.amountOz)} oz
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void persistFavoriteDrinks([
                          ...settings.favoriteDrinks.filter((favorite) => favorite.key !== drink.key),
                          {
                            key: drink.key,
                            name: drink.name,
                            amountOz: drink.amountOz,
                          },
                        ])
                      }
                      disabled={isSavingFavorite || !accessToken}
                      aria-label={`Favorite ${drink.name}`}
                      className="border-l border-white/10 px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      ☆
                    </button>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Favorite one drink to pin it above with your core quick-add buttons. These logs do
                not change your water target yet.
              </p>
            </div>
          )}
        </section>

        

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Tracker settings
              </p>
              <p className="mt-2 text-sm text-slate-300">
                {settings.bottleSizeOz} oz bottle · {settings.dailyGoalOz} oz daily goal
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsSettingsOpen((isOpen) => !isOpen)}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              {isSettingsOpen ? "Close" : "Edit"}
            </button>
          </div>

          {isSettingsOpen && (
            <form className="mt-6 space-y-4 border-t border-white/10 pt-5" onSubmit={saveSettings}>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-300">Daily goal (oz)</span>
                  <input
                    type="number"
                    min="16"
                    max="512"
                    step="1"
                    value={draftSettings.dailyGoalOz}
                    onChange={(event) =>
                      setDraftSettings((currentSettings) => ({
                        ...currentSettings,
                        dailyGoalOz: Number(event.target.value),
                      }))
                    }
                    required
                    className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-2.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-300">Bottle size (oz)</span>
                  <input
                    type="number"
                    min="4"
                    max="128"
                    step="1"
                    value={draftSettings.bottleSizeOz}
                    onChange={(event) =>
                      setDraftSettings((currentSettings) => ({
                        ...currentSettings,
                        bottleSizeOz: Number(event.target.value),
                      }))
                    }
                    required
                    className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-2.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                <p className="text-sm font-medium text-white">Favorite quick adds</p>
                <p className="mt-1 text-sm text-slate-400">
                  Favorite drinks from the dashboard quick select area. They stay pinned across
                  future sessions until removed.
                </p>

                {draftSettings.favoriteDrinks.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {draftSettings.favoriteDrinks.map((drink) => (
                      <div
                        key={drink.key}
                        className="flex items-center gap-2 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.05] px-3 py-2"
                      >
                        <p className="text-sm text-slate-200">
                          {drink.name} · {formatOunces(drink.amountOz)} oz
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftSettings((currentSettings) => ({
                              ...currentSettings,
                              favoriteDrinks: currentSettings.favoriteDrinks.filter(
                                (favorite) => favorite.key !== drink.key,
                              ),
                            }))
                          }
                          className="rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">No favorite drinks selected yet.</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="flex-1 rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-[#071015] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingSettings ? "Saving…" : "Save settings"}
                </button>
                <button
                  type="button"
                  onClick={cancelSettings}
                  disabled={isSavingSettings}
                  className="rounded-lg border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
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
            {todayEntries.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                No water logged yet. Finish your first bottle and tap the tag.
              </p>
            )}

            {todayEntries.map((entry) => (
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
                    onClick={() => deleteEntry(entry.id)}
                    disabled={isDeleting || !accessToken}
                    className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:border-red-400/40 hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}