"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import HydrationPaceCard from "@/components/dashboard/HydrationPaceCard";
import TopNav from "@/components/top-nav";
import SnapshotStatsGrid from "@/components/dashboard/SnapshotStatsGrid";
import HydrationSnapshotCard from "@/components/dashboard/HydrationSnapshotCard";
import ManualLogCard from "@/components/dashboard/ManualLogCard";
import TrackerSettingsCard from "@/components/dashboard/TrackerSettingsCard";
import RecentActivityCard from "@/components/dashboard/RecentActivityCard";
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
  bottle_name: string | null;
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
  dailyGoalOz?: number;
  bottleSizeOz?: number;
  favoriteDrinks?: FavoriteDrink[] | null;
  daily_goal_oz?: number;
  bottle_size_oz?: number;
  favorite_drinks?: FavoriteDrink[] | null;
  updatedAt?: string;
  updated_at?: string;
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

function getMonthGrid(
  monthKey: string,
  ouncesByEasternDate: Record<string, number>,
  todayEastern: string,
): CalendarDay[] {
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

function normalizeSettings(settings: TrackerSettingsApiResponse | null | undefined): TrackerSettings {
  const rawDailyGoal =
    settings?.dailyGoalOz ??
    settings?.daily_goal_oz ??
    defaultDailyGoalOz;

  const rawBottleSize =
    settings?.bottleSizeOz ??
    settings?.bottle_size_oz ??
    defaultBottleSizeOz;

  const rawFavoriteDrinks =
    settings?.favoriteDrinks ??
    settings?.favorite_drinks ??
    [];

  const favoriteDrinks = Array.isArray(rawFavoriteDrinks)
    ? rawFavoriteDrinks
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

  const dailyGoalOz = Number(rawDailyGoal);
  const bottleSizeOz = Number(rawBottleSize);

  return {
    dailyGoalOz:
      Number.isFinite(dailyGoalOz) && dailyGoalOz > 0
        ? dailyGoalOz
        : defaultDailyGoalOz,
    bottleSizeOz:
      Number.isFinite(bottleSizeOz) && bottleSizeOz > 0
        ? bottleSizeOz
        : defaultBottleSizeOz,
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
  const [selectedMonthKey, setSelectedMonthKey] = useState(
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
    async (token: string, options?: { mode?: SnapshotMode; monthKey?: string }) => {
      const mode = options?.mode ?? snapshotMode;
      const monthKey = options?.monthKey ?? selectedMonthKey;
      const entriesPath =
        mode === "monthly" ? `/api/water-log?month=${monthKey}` : "/api/water-log?days=7";

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
      const loadedSettings = normalizeSettings(settingsData?.settings);

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
        console.error("Dashboard initialization failed", error);
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
      .channel(`water-entries-${userId}`)
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
        console.log("Water-entries Realtime status", status);
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
  const snapshotAverageOz = Math.round(snapshotTotalOz / Math.max(snapshotDays.length, 1));
  const snapshotGoalHitCount = snapshotDays.filter(
    (day) => day.ounces >= settings.dailyGoalOz,
  ).length;

  const bestDay =
    snapshotDays.length > 0
      ? snapshotDays.reduce((best, day) => (day.ounces > best.ounces ? day : best), snapshotDays[0])
      : undefined;

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
      ? `Daily target complete. ${currentOz} oz logged today.`
      : remainingOz <= settings.bottleSizeOz
        ? `One more bottle gets you to your target. ${remainingOz} oz to go for today.`
        : `${remainingOz} oz remaining to hit your daily goal.`;

  const insightCopy =
    snapshotMode === "monthly"
      ? snapshotAverageOz >= settings.dailyGoalOz
        ? `Your ${formatMonthLabel(selectedMonthKey)} average is ${snapshotAverageOz} oz per day, ${snapshotAverageOz - settings.dailyGoalOz} oz above target.`
        : `Your ${formatMonthLabel(selectedMonthKey)} average is ${snapshotAverageOz} oz per day, ${settings.dailyGoalOz - snapshotAverageOz} oz below target.`
      : snapshotGoalHitCount === 7
        ? "Perfect week so far. You have reached your target every day."
        : snapshotAverageOz >= settings.dailyGoalOz
          ? `You are averaging ${snapshotAverageOz} oz per day, ${snapshotAverageOz - settings.dailyGoalOz} oz above target.`
          : `Your 7-day average is ${snapshotAverageOz} oz, ${settings.dailyGoalOz - snapshotAverageOz} oz below target.`;

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
        headers: {
          "Content-Type": "application/json",
        },
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

  async function logManualBottle(override?: {
    amountOz?: number;
    bottleName?: string;
    clearCustomDrink?: boolean;
  }) {
    const amountToLog = override?.amountOz ?? manualAmount;
    const bottleName =
      override?.bottleName ??
      (trimmedManualDrinkName.length > 0 ? trimmedManualDrinkName : "Manual entry");

    if (!accessToken || !Number.isFinite(amountToLog) || amountToLog <= 0 || amountToLog > 512) {
      setErrorMessage("Enter an amount between 0.1 and 512 oz.");
      return;
    }

    setIsSavingEntry(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await authorizedFetch("/api/water-log", accessToken, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
        {
          method: "DELETE",
        },
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
        headers: {
          "Content-Type": "application/json",
        },
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
        Checking secure session...
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
            onClick={() => void signOut()}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-slate-400 transition hover:border-white/20 hover:text-white"
          >
            Sign out
          </button>
        </header>

        <TopNav />

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
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
                  <p className="mt-3 text-3xl font-semibold text-emerald-300">
                    Goal complete
                  </p>
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
            todayEntries={todayEntries}
          />
        </div>

        <SnapshotStatsGrid
          snapshotMode={snapshotMode}
          selectedMonthKey={selectedMonthKey}
          snapshotAverageOz={snapshotAverageOz}
          snapshotGoalHitCount={snapshotGoalHitCount}
          snapshotDaysLength={snapshotDays.length}
          snapshotTotalOz={snapshotTotalOz}
          currentStreak={currentStreak}
          bestDay={bestDay}
          formatMonthLabel={formatMonthLabel}
        />

        <HydrationSnapshotCard
          snapshotMode={snapshotMode}
          snapshotLabel={snapshotLabel}
          snapshotSubcopy={snapshotSubcopy}
          selectedMonthKey={selectedMonthKey}
          todayMonthKey={todayMonthKey}
          earliestHistoryMonth={earliestHistoryMonth}
          weeklyDays={weeklyDays}
          monthlyCalendarDays={monthlyCalendarDays}
          settingsDailyGoalOz={settings.dailyGoalOz}
          chartTop={chartTop}
          chartTicks={chartTicks}
          switchSnapshotMode={switchSnapshotMode}
          jumpMonth={jumpMonth}
          formatMonthLabel={formatMonthLabel}
        />

        <section className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/80">
            Hydration insight
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{insightCopy}</p>
        </section>

        <ManualLogCard
          bottleSizeOz={settings.bottleSizeOz}
          manualDrinkName={manualDrinkName}
          manualAmountOz={manualAmountOz}
          trimmedManualDrinkName={trimmedManualDrinkName}
          canLogManualAmount={canLogManualAmount}
          isSavingEntry={isSavingEntry}
          isSavingFavorite={isSavingFavorite}
          isQuickSelectOpen={isQuickSelectOpen}
          accessToken={accessToken}
          quickLogSizes={quickLogSizes}
          collapsibleQuickDrinks={collapsibleQuickDrinks}
          favoriteDrinksLength={settings.favoriteDrinks.length}
          setManualDrinkName={setManualDrinkName}
          setManualAmountOz={setManualAmountOz}
          setIsQuickSelectOpen={setIsQuickSelectOpen}
          onLog={logManualBottle}
          onFavoriteTypedDrink={favoriteTypedDrink}
          onRemoveFavoriteDrink={removeFavoriteDrink}
          onPersistFavoriteDrink={async (drink) => {
            await persistFavoriteDrinks([
              ...settings.favoriteDrinks.filter((favorite) => favorite.key !== drink.key),
              drink,
            ]);
          }}
        />

        <TrackerSettingsCard
          settings={settings}
          draftSettings={draftSettings}
          isSettingsOpen={isSettingsOpen}
          isSavingSettings={isSavingSettings}
          setIsSettingsOpen={setIsSettingsOpen}
          setDraftSettings={setDraftSettings}
          saveSettings={saveSettings}
          cancelSettings={cancelSettings}
        />

        {statusMessage ? (
          <p className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-medium text-emerald-200">
            {statusMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-5 rounded-lg border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm font-medium text-red-200">
            {errorMessage}
          </p>
        ) : null}

        <RecentActivityCard
          todayEntries={todayEntries}
          isDeleting={isDeleting}
          accessToken={accessToken}
          formatTime={formatTime}
          formatOunces={formatOunces}
          deleteEntry={deleteEntry}
        />
      </div>
    </main>
  );
}