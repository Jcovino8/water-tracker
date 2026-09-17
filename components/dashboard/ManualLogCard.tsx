"use client";

import { useMemo, useState } from "react";

type FavoriteDrink = {
  key: string;
  name: string;
  amountOz: number;
};

type QuickLogItem =
  | {
      type: "size";
      key: string;
      label: string;
      amountOz: number;
    }
  | {
      type: "favorite-drink";
      key: string;
      label: string;
      amountOz: number;
      drinkName: string;
      drinkKey: string;
    };

type WaterEntryOption = {
  id: string;
  created_at: string;
  amount_oz: number;
  bottle_name: string | null;
};

type SearchDrink = {
  key: string;
  name: string;
  defaultAmountOz: number;
  servingLabel: string;
  hydrationNote: string;
  kind: "drink" | "mix-in";
};

type MixInMode = "attach" | "separate";

const searchableDrinks: SearchDrink[] = [
  {
    key: "water",
    name: "Water",
    defaultAmountOz: 16,
    servingLabel: "Plain water",
    hydrationNote: "Counts fully toward hydration.",
    kind: "drink",
  },
  {
    key: "sparkling-water",
    name: "Sparkling water",
    defaultAmountOz: 16.9,
    servingLabel: "1 bottle",
    hydrationNote: "Counts fully toward hydration.",
    kind: "drink",
  },
  {
    key: "black-coffee",
    name: "Black coffee",
    defaultAmountOz: 8,
    servingLabel: "1 cup",
    hydrationNote: "Counts toward fluid intake.",
    kind: "drink",
  },
  {
    key: "cold-brew",
    name: "Cold brew coffee",
    defaultAmountOz: 12,
    servingLabel: "1 cup",
    hydrationNote: "Counts toward fluid intake.",
    kind: "drink",
  },
  {
    key: "green-tea",
    name: "Green tea",
    defaultAmountOz: 12,
    servingLabel: "1 cup",
    hydrationNote: "Counts toward fluid intake.",
    kind: "drink",
  },
  {
    key: "black-tea",
    name: "Black tea",
    defaultAmountOz: 12,
    servingLabel: "1 cup",
    hydrationNote: "Counts toward fluid intake.",
    kind: "drink",
  },
  {
    key: "gatorade",
    name: "Gatorade Thirst Quencher",
    defaultAmountOz: 20,
    servingLabel: "1 bottle",
    hydrationNote: "Fluid with electrolytes and sugar.",
    kind: "drink",
  },
  {
    key: "gatorade-zero",
    name: "Gatorade Zero",
    defaultAmountOz: 20,
    servingLabel: "1 bottle",
    hydrationNote: "Fluid with electrolytes and no sugar.",
    kind: "drink",
  },
  {
    key: "powerade",
    name: "Powerade",
    defaultAmountOz: 20,
    servingLabel: "1 bottle",
    hydrationNote: "Fluid with electrolytes and sugar.",
    kind: "drink",
  },
  {
    key: "liquid-iv",
    name: "Liquid I.V. Hydration Multiplier",
    defaultAmountOz: 16,
    servingLabel: "1 stick mixed into water",
    hydrationNote: "Attach it to logged water or log a new prepared drink.",
    kind: "mix-in",
  },
  {
    key: "lmnt",
    name: "LMNT Electrolyte Drink Mix",
    defaultAmountOz: 16,
    servingLabel: "1 stick mixed into water",
    hydrationNote: "Attach it to logged water or log a new prepared drink.",
    kind: "mix-in",
  },
  {
    key: "nuun",
    name: "Nuun Sport",
    defaultAmountOz: 16,
    servingLabel: "1 tablet mixed into water",
    hydrationNote: "Attach it to logged water or log a new prepared drink.",
    kind: "mix-in",
  },
  {
    key: "pedialyte",
    name: "Pedialyte",
    defaultAmountOz: 12,
    servingLabel: "1 serving",
    hydrationNote: "Fluid with electrolytes.",
    kind: "drink",
  },
  {
    key: "coconut-water",
    name: "Coconut water",
    defaultAmountOz: 11.2,
    servingLabel: "1 carton",
    hydrationNote: "Fluid with naturally occurring electrolytes.",
    kind: "drink",
  },
];

type ManualLogCardProps = {
  bottleSizeOz: number;
  manualDrinkName: string;
  manualAmountOz: string;
  trimmedManualDrinkName: string;
  canLogManualAmount: boolean;
  isSavingEntry: boolean;
  isSavingFavorite: boolean;
  accessToken: string;
  quickLogSizes: QuickLogItem[];
  favoriteDrinksLength: number;
  recentWaterEntries?: WaterEntryOption[];
  setManualDrinkName: (value: string) => void;
  setManualAmountOz: (value: string) => void;
  onLog: (override?: {
    amountOz?: number;
    bottleName?: string;
    clearCustomDrink?: boolean;
  }) => Promise<void>;
  onFavoriteTypedDrink: () => Promise<void>;
  onRemoveFavoriteDrink: (drinkKey: string) => Promise<void>;
  onAttachMixIn: (input: {
    waterEntryId: string;
    additionName: string;
  }) => Promise<void>;
};

function formatOunces(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function clampAmount(value: number) {
  return Math.min(512, Math.max(0.1, value));
}

function toAmountInputValue(value: number) {
  return String(Number(clampAmount(value).toFixed(1)));
}

function findSearchDrinkByName(name: string) {
  const normalizedName = name.trim().toLowerCase();

  return (
    searchableDrinks.find(
      (drink) => drink.name.trim().toLowerCase() === normalizedName,
    ) ?? null
  );
}

export default function ManualLogCard({
  bottleSizeOz,
  manualDrinkName,
  manualAmountOz,
  trimmedManualDrinkName,
  canLogManualAmount,
  isSavingEntry,
  isSavingFavorite,
  accessToken,
  quickLogSizes,
  favoriteDrinksLength,
  recentWaterEntries,
  setManualDrinkName,
  setManualAmountOz,
  onLog,
  onFavoriteTypedDrink,
  onRemoveFavoriteDrink,
  onAttachMixIn,
}: ManualLogCardProps) {
  const availableWaterEntries = recentWaterEntries ?? [];
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedDrink, setSelectedDrink] = useState<SearchDrink | null>(null);
  const [mixInMode, setMixInMode] = useState<MixInMode>("attach");
  const [selectedWaterEntryId, setSelectedWaterEntryId] = useState("");
  const [isAttachingMixIn, setIsAttachingMixIn] = useState(false);

  const searchResults = useMemo(() => {
    const query = manualDrinkName.trim().toLowerCase();

    if (query.length < 2) {
      return [];
    }

    return searchableDrinks
      .filter((drink) => {
        const searchableText = [
          drink.name,
          drink.key,
          drink.servingLabel,
          drink.hydrationNote,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      })
      .slice(0, 5);
  }, [manualDrinkName]);

  const showSearchResults =
    isSearchFocused && manualDrinkName.trim().length >= 2;

  const selectedDrinkIsMixIn = selectedDrink?.kind === "mix-in";
  const selectedDrinkName = selectedDrink?.name ?? trimmedManualDrinkName;
  const currentAmount = Number(manualAmountOz);
  const hasRecentWaterEntries = availableWaterEntries.length > 0;

  function selectSearchDrink(drink: SearchDrink) {
    setSelectedDrink(drink);
    setManualDrinkName(drink.name);
    setSelectedWaterEntryId("");

    if (drink.kind === "mix-in") {
      setMixInMode(hasRecentWaterEntries ? "attach" : "separate");
      setManualAmountOz(toAmountInputValue(drink.defaultAmountOz));
    } else {
      setManualAmountOz(toAmountInputValue(drink.defaultAmountOz));
    }

    setIsSearchFocused(false);
  }

  function selectQuickLogItem(item: QuickLogItem) {
    if (item.type === "favorite-drink") {
      const matchingCatalogDrink = findSearchDrinkByName(item.drinkName);

      setManualDrinkName(item.drinkName);
      setSelectedWaterEntryId("");
      setIsSearchFocused(false);

      if (matchingCatalogDrink?.kind === "mix-in") {
        setSelectedDrink(matchingCatalogDrink);
        setMixInMode(hasRecentWaterEntries ? "attach" : "separate");
        setManualAmountOz(
          toAmountInputValue(matchingCatalogDrink.defaultAmountOz),
        );
        return;
      }

      setSelectedDrink(null);
      setManualAmountOz(toAmountInputValue(item.amountOz));
      return;
    }

    setManualAmountOz(toAmountInputValue(item.amountOz));
    setManualDrinkName("");
    setSelectedDrink(null);
    setSelectedWaterEntryId("");
    setIsSearchFocused(false);
  }

  function handleDrinkNameChange(value: string) {
    setManualDrinkName(value);

    if (selectedDrink && value !== selectedDrink.name) {
      setSelectedDrink(null);
      setSelectedWaterEntryId("");
    }
  }

  function selectMixInMode(nextMode: MixInMode) {
    if (!selectedDrink || selectedDrink.kind !== "mix-in") {
      return;
    }

    setMixInMode(nextMode);

    if (nextMode === "separate") {
      setManualAmountOz(toAmountInputValue(selectedDrink.defaultAmountOz));
      return;
    }

    setSelectedWaterEntryId("");
  }

  function decreaseAmount() {
    const startingAmount = Number.isFinite(currentAmount)
      ? currentAmount
      : 1;

    setManualAmountOz(toAmountInputValue(startingAmount - 1));
  }

  function increaseAmount() {
    const startingAmount = Number.isFinite(currentAmount)
      ? currentAmount
      : 1;

    setManualAmountOz(toAmountInputValue(startingAmount + 1));
  }

  async function favoriteSelectedDrink() {
    if (!selectedDrinkName || !canLogManualAmount) {
      return;
    }

    await onFavoriteTypedDrink();
  }

  async function attachMixInToLoggedWater() {
    if (!selectedDrinkName || !selectedWaterEntryId) {
      return;
    }

    setIsAttachingMixIn(true);

    try {
      await onAttachMixIn({
        waterEntryId: selectedWaterEntryId,
        additionName: selectedDrinkName,
      });

      setSelectedWaterEntryId("");
      setSelectedDrink(null);
      setManualDrinkName("");
    } finally {
      setIsAttachingMixIn(false);
    }
  }
  async function handlePrimaryAction() {
    if (selectedDrinkIsMixIn && mixInMode === "attach") {
      await attachMixInToLoggedWater();
      return;
    }

    await onLog({
      bottleName: logName,
      clearCustomDrink: trimmedManualDrinkName.length > 0,
    });
  }
  const logName =
    selectedDrinkIsMixIn && selectedDrinkName && mixInMode === "separate"
      ? `Water with ${selectedDrinkName}`
      : undefined;

  const logDisabled =
    isSavingEntry ||
    !accessToken ||
    !canLogManualAmount ||
    (selectedDrinkIsMixIn && mixInMode === "attach");

  return (
    <section className="mt-5 rounded-2xl border border-cyan-300/15 bg-[#111720] p-5 transition-[min-height] duration-200 ease-out sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Manual log
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Add hydration
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Log water or find any drink you finish.
          </p>
        </div>

        <p className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-400">
          Your bottle: {formatOunces(bottleSizeOz)} oz
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
                  onClick={() => selectQuickLogItem(item)}
                  className="px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.08]"
                >
                  {item.label}
                </button>

                <button
                  type="button"
                  onClick={() => void onRemoveFavoriteDrink(item.drinkKey)}
                  disabled={isSavingFavorite || !accessToken}
                  className="border-l border-cyan-300/20 px-2.5 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-300/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Remove favorite ${item.drinkName}`}
                >
                  ×
                </button>
              </div>
            );
          }

          const isSelected =
            Number(manualAmountOz) === item.amountOz &&
            trimmedManualDrinkName.length === 0;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => selectQuickLogItem(item)}
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

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_148px]">
        <label className="relative z-20 flex-1">
          <span className="sr-only">Search or add a drink</span>

          <input
            type="text"
            maxLength={80}
            value={manualDrinkName}
            onFocus={() => {
              if (manualDrinkName.trim().length >= 2) {
                setIsSearchFocused(true);
              }
            }}
            onBlur={() => {
              window.setTimeout(() => {
                setIsSearchFocused(false);
              }, 200);
            }}
            onChange={(event) => {
              handleDrinkNameChange(event.target.value);
              setIsSearchFocused(true);
            }}
            placeholder="Search or add a drink"
            className="w-full rounded-lg border border-white/10 bg-[#0b0e13] px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
            aria-label="Search or add a drink"
            aria-autocomplete="list"
            aria-expanded={showSearchResults}
            aria-controls="drink-search-results"
          />

          {showSearchResults ? (
            <div
              id="drink-search-results"
              className="prism-dropdown-enter absolute left-0 right-0 top-[calc(100%+0.5rem)] overflow-hidden rounded-xl border border-white/10 bg-[#121923] shadow-2xl shadow-black/40"
            >
              {searchResults.length > 0 ? (
                <div className="p-1.5">
                  {searchResults.map((drink) => (
                    <button
                      key={drink.key}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSearchDrink(drink)}
                      className="w-full rounded-lg px-3 py-3 text-left transition hover:bg-white/[0.05]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {drink.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {drink.servingLabel}
                          </p>
                        </div>

                        {drink.kind === "mix-in" ? (
                          <span className="shrink-0 rounded-md border border-cyan-300/20 bg-cyan-300/[0.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
                            Mix-in
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 text-xs text-cyan-200/80">
                        {drink.hydrationNote}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-3 text-sm text-slate-400">
                  Use “{manualDrinkName.trim()}” as a custom drink.
                </p>
              )}
            </div>
          ) : null}
        </label>

          <div className="flex min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#0b0e13] transition focus-within:border-cyan-300 focus-within:ring-2 focus-within:ring-cyan-300/20">          <button
            type="button"
            onClick={decreaseAmount}
            disabled={
              isSavingEntry ||
              (Number.isFinite(currentAmount) && currentAmount <= 0.1)
            }
            className="w-12 shrink-0 border-r border-white/10 text-lg font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Decrease amount by 1 ounce"
          >
            −
          </button>

          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Custom ounces</span>

            <input
              type="number"
              min="0.1"
              max="512"
              step="any"
              value={manualAmountOz}
              onChange={(event) => setManualAmountOz(event.target.value)}
              disabled={selectedDrinkIsMixIn && mixInMode === "attach"}
              className="w-full bg-transparent px-3 py-3 pr-10 text-center text-lg font-semibold text-white outline-none disabled:cursor-not-allowed disabled:text-slate-500"
              aria-label="Custom ounces"
            />

            <span className="pointer-events-none absolute right-3 top-3.5 text-sm font-medium text-slate-500">
              oz
            </span>
          </label>

          <button
            type="button"
            onClick={increaseAmount}
            disabled={
              isSavingEntry ||
              (Number.isFinite(currentAmount) && currentAmount >= 512)
            }
            className="w-12 shrink-0 border-l border-white/10 text-lg font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Increase amount by 1 ounce"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handlePrimaryAction()}
          disabled={
            selectedDrinkIsMixIn && mixInMode === "attach"
              ? isAttachingMixIn || !accessToken || !selectedWaterEntryId
              : isSavingEntry || !accessToken || !canLogManualAmount
          }
          className="w-full rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-[#071015] transition hover:bg-cyan-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {selectedDrinkIsMixIn && mixInMode === "attach"
            ? isAttachingMixIn
              ? "Adding mix..."
              : `Add ${selectedDrinkName}`
            : isSavingEntry
              ? "Logging..."
              : `Log ${canLogManualAmount ? manualAmountOz : ""} oz`}
        </button>
      </div>

      <div className="min-h-[0] transition-all duration-200 ease-out">
        {selectedDrinkIsMixIn ? (
          <section className="prism-enter mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200/80">
              Electrolyte mix
            </p>

            <p className="mt-2 text-sm font-semibold text-cyan-100">
              How should we record {selectedDrinkName}?
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => selectMixInMode("attach")}
                className={`rounded-lg border px-3 py-3 text-left transition ${
                  mixInMode === "attach"
                    ? "border-cyan-300 bg-cyan-300 text-[#071015]"
                    : "border-white/10 bg-[#0b0e13] text-slate-300 hover:border-white/20 hover:text-white"
                }`}
              >
                <span className="block text-sm font-semibold">
                  Add to logged bottle
                </span>
                <span
                  className={`mt-1 block text-xs ${
                    mixInMode === "attach"
                      ? "text-[#071015]/75"
                      : "text-slate-500"
                  }`}
                >
                  Attach it to water you already logged. Adds no ounces.
                </span>
              </button>

              <button
                type="button"
                onClick={() => selectMixInMode("separate")}
                className={`rounded-lg border px-3 py-3 text-left transition ${
                  mixInMode === "separate"
                    ? "border-cyan-300 bg-cyan-300 text-[#071015]"
                    : "border-white/10 bg-[#0b0e13] text-slate-300 hover:border-white/20 hover:text-white"
                }`}
              >
                <span className="block text-sm font-semibold">
                  Log separate drink
                </span>
                <span
                  className={`mt-1 block text-xs ${
                    mixInMode === "separate"
                      ? "text-[#071015]/75"
                      : "text-slate-500"
                  }`}
                >
                  Create a new prepared drink and add its fluid amount.
                </span>
              </button>
            </div>

            {mixInMode === "attach" ? (
              <div className="mt-4">
                {hasRecentWaterEntries ? (
                  <>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Add to a logged bottle
                      </p>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {availableWaterEntries.map((entry) => {
                          const isSelected = selectedWaterEntryId === entry.id;

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => setSelectedWaterEntryId(entry.id)}
                              className={`rounded-lg border px-3 py-3 text-left transition ${
                                isSelected
                                  ? "border-cyan-300 bg-cyan-300 text-[#071015]"
                                  : "border-white/10 bg-[#0b0e13] text-slate-300 hover:border-white/20 hover:text-white"
                              }`}
                            >
                              <span className="block text-sm font-semibold">
                                {formatOunces(Number(entry.amount_oz))} oz
                              </span>

                              <span
                                className={`mt-1 block text-xs ${
                                  isSelected
                                    ? "text-[#071015]/75"
                                    : "text-slate-500"
                                }`}
                              >
                                {entry.bottle_name || "Water"} ·{" "}
                                {formatTime(entry.created_at)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Select a logged bottle, then use the main button above. This
                      adds the electrolyte record without changing your daily
                      hydration total.
                    </p>
                  </>
                ) : (
                  <p className="rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-3 text-sm text-slate-400">
                    No logged water entries are available today. Choose “Log
                    separate drink” to add this prepared drink to your total.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-300">
                Logging{" "}
                <span className="font-semibold text-white">
                  {formatOunces(Number(manualAmountOz) || 0)} oz water with{" "}
                  {selectedDrinkName}
                </span>
                .
              </p>
            )}
          </section>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void favoriteSelectedDrink()}
          disabled={
            isSavingFavorite ||
            !accessToken ||
            !trimmedManualDrinkName ||
            !canLogManualAmount
          }
          className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {favoriteDrinksLength > 0
            ? "Add to favorites"
            : "Favorite this drink"}
        </button>
      </div>
    </section>
  );
}