"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ManualLogCard from "@/components/dashboard/ManualLogCard";
import TopNav from "@/components/top-nav";
import { browserSupabase } from "@/lib/supabase-browser";

const defaultDailyGoalOz = 96;
const defaultBottleSizeOz = 25;
const commonBottleSizes = [16.9, 20, 25];

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
};

function normalizeSettings(
  settings: TrackerSettingsApiResponse | null | undefined,
): TrackerSettings {
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

  const dailyGoalOz = Number(rawDailyGoal);
  const bottleSizeOz = Number(rawBottleSize);

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

function slugifyDrinkKey(name: string, amountOz: number) {
  return `${name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}-${String(amountOz).replace(".", "-")}`;
}

function formatOunces(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

export default function ManualLogPage() {
  const [accessToken, setAccessToken] = useState("");
  const [manualAmountOz, setManualAmountOz] = useState(
    String(defaultBottleSizeOz),
  );
  const [manualDrinkName, setManualDrinkName] = useState("");
  const [entries, setEntries] = useState<WaterEntry[]>([]);
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [settings, setSettings] = useState<TrackerSettings>({
    dailyGoalOz: defaultDailyGoalOz,
    bottleSizeOz: defaultBottleSizeOz,
    favoriteDrinks: [],
  });

  const loadPageData = useCallback(async (token: string) => {
    const [settingsResponse, entriesResponse] = await Promise.all([
      authorizedFetch("/api/tracker-settings", token),
      authorizedFetch("/api/water-log?days=1", token),
    ]);

    if (!settingsResponse.ok || !entriesResponse.ok) {
      const [settingsError, entriesError] = await Promise.all([
        settingsResponse
          .json()
          .catch(() => ({ error: "Unknown tracker-settings error." })),
        entriesResponse
          .json()
          .catch(() => ({ error: "Unknown water-log error." })),
      ]);

      throw new Error(
        `Unable to load manual log data. Settings: ${
          settingsError.error ?? settingsResponse.status
        }. Entries: ${entriesError.error ?? entriesResponse.status}.`,
      );
    }

    const settingsData = await settingsResponse.json();
    const entriesData = await entriesResponse.json();
    const loadedSettings = normalizeSettings(settingsData.settings);

    setSettings(loadedSettings);
    setEntries(Array.isArray(entriesData.entries) ? entriesData.entries : []);
    setManualAmountOz(String(loadedSettings.bottleSizeOz));
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initializePage() {
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
        await loadPageData(session.access_token);
      } catch (error) {
        console.error("Manual log initialization failed", error);

        if (isMounted) {
          setErrorMessage(
            "Could not load your manual logging options. Please refresh and try again.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void initializePage();

    return () => {
      isMounted = false;
    };
  }, [loadPageData]);

  const manualAmount = Number(manualAmountOz);
  const trimmedManualDrinkName = manualDrinkName.trim();

  const canLogManualAmount =
    Number.isFinite(manualAmount) && manualAmount > 0 && manualAmount <= 512;

  const favoriteDrinkPresets = useMemo(
    () =>
      settings.favoriteDrinks.map((drink) => ({
        key: drink.key,
        name: drink.name,
        amountOz: drink.amountOz,
      })),
    [settings.favoriteDrinks],
  );

  useEffect(() => {
    if (!statusMessage && !errorMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage("");
      setErrorMessage("");
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [errorMessage, statusMessage]);

  const quickLogSizes = useMemo(() => {
    const sizeButtons = Array.from(
      new Set([...commonBottleSizes, settings.bottleSizeOz]),
    )
      .sort((a, b) => a - b)
      .map((size) => ({
        type: "size" as const,
        key: `size-${size}`,
        label: `${formatOunces(size)} oz${
          size === settings.bottleSizeOz ? " · My bottle" : ""
        }`,
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

  async function persistFavoriteDrinks(nextFavoriteDrinks: FavoriteDrink[]) {
    if (!accessToken) return;

    setIsSavingFavorite(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await authorizedFetch(
        "/api/tracker-settings",
        accessToken,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dailyGoalOz: settings.dailyGoalOz,
            bottleSizeOz: settings.bottleSizeOz,
            favoriteDrinks: nextFavoriteDrinks,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Unable to save favorite drinks.");
      }

      const data = await response.json();
      const updatedSettings = normalizeSettings(data.settings);

      setSettings(updatedSettings);
      setStatusMessage(
        nextFavoriteDrinks.length > settings.favoriteDrinks.length
          ? "Drink added to favorites."
          : "Favorite drink removed.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save favorite drinks.",
      );
    } finally {
      setIsSavingFavorite(false);
    }
  }

  async function logManualBottle(override?: {
    amountOz?: number;
    bottleName?: string;
    clearCustomDrink?: boolean;
  }) {
    const amountToLog = override?.amountOz ?? manualAmount;
    const bottleName =
      override?.bottleName ??
      (trimmedManualDrinkName || "Manual entry");

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

      setStatusMessage(`${formatOunces(amountToLog)} oz logged.`);

      if (override?.clearCustomDrink) {
        setManualDrinkName("");
      }

      await loadPageData(accessToken);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save hydration entry.",
      );
    } finally {
      setIsSavingEntry(false);
    }
  }

  async function favoriteTypedDrink() {
    if (!trimmedManualDrinkName || !canLogManualAmount) {
      setErrorMessage(
        "Enter a drink name and a valid ounce amount to favorite it.",
      );
      return;
    }

    const nextFavorite: FavoriteDrink = {
      key: slugifyDrinkKey(trimmedManualDrinkName, manualAmount),
      name: trimmedManualDrinkName,
      amountOz: Number(manualAmount.toFixed(1)),
    };

    await persistFavoriteDrinks([
      ...settings.favoriteDrinks.filter(
        (drink) => drink.key !== nextFavorite.key,
      ),
      nextFavorite,
    ]);
  }

  async function removeFavoriteDrink(drinkKey: string) {
    await persistFavoriteDrinks(
      settings.favoriteDrinks.filter((drink) => drink.key !== drinkKey),
    );
  }

  async function attachMixIn(input: {
    waterEntryId: string;
    additionName: string;
  }) {
    if (!accessToken) return;

    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await authorizedFetch(
        "/api/water-entry-additions",
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to add electrolyte mix.");
      }

      setStatusMessage(
        `${input.additionName} added to your logged bottle. Hydration total unchanged.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not add electrolyte mix.",
      );
      throw error;
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0e13] px-5 text-slate-400">
        Loading manual log...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0e13] px-4 py-6 text-slate-100 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.9)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Tally
            </p>
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Manual log
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Manually log your additional drinks here for more precise hydration
            insights.
          </p>
        </header>

        <TopNav />

        <div className="mt-6">
          <ManualLogCard
            bottleSizeOz={settings.bottleSizeOz}
            manualDrinkName={manualDrinkName}
            manualAmountOz={manualAmountOz}
            trimmedManualDrinkName={trimmedManualDrinkName}
            canLogManualAmount={canLogManualAmount}
            isSavingEntry={isSavingEntry}
            isSavingFavorite={isSavingFavorite}
            accessToken={accessToken}
            quickLogSizes={quickLogSizes}
            favoriteDrinksLength={settings.favoriteDrinks.length}
            recentWaterEntries={entries}
            setManualDrinkName={setManualDrinkName}
            setManualAmountOz={setManualAmountOz}
            onLog={logManualBottle}
            onFavoriteTypedDrink={favoriteTypedDrink}
            onRemoveFavoriteDrink={removeFavoriteDrink}
            onAttachMixIn={attachMixIn}
          />
        </div>

        {statusMessage ? (
          <p className="prism-enter mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-medium text-emerald-200">
            {statusMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="prism-enter mt-5 rounded-lg border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm font-medium text-red-200">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </main>
  );
}