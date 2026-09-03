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

type DrinkPreset = {
  key: string;
  name: string;
  amountOz: number;
};

type ManualLogCardProps = {
  bottleSizeOz: number;
  manualDrinkName: string;
  manualAmountOz: string;
  trimmedManualDrinkName: string;
  canLogManualAmount: boolean;
  isSavingEntry: boolean;
  isSavingFavorite: boolean;
  isQuickSelectOpen: boolean;
  accessToken: string;
  quickLogSizes: QuickLogItem[];
  collapsibleQuickDrinks: readonly DrinkPreset[];
  favoriteDrinksLength: number;
  setManualDrinkName: (value: string) => void;
  setManualAmountOz: (value: string) => void;
  setIsQuickSelectOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  onLog: (override?: {
    amountOz?: number;
    bottleName?: string;
    clearCustomDrink?: boolean;
  }) => Promise<void>;
  onFavoriteTypedDrink: () => Promise<void>;
  onRemoveFavoriteDrink: (drinkKey: string) => Promise<void>;
  onPersistFavoriteDrink: (drink: FavoriteDrink) => Promise<void>;
};

export default function ManualLogCard({
  bottleSizeOz,
  manualDrinkName,
  manualAmountOz,
  trimmedManualDrinkName,
  canLogManualAmount,
  isSavingEntry,
  isSavingFavorite,
  isQuickSelectOpen,
  accessToken,
  quickLogSizes,
  collapsibleQuickDrinks,
  favoriteDrinksLength,
  setManualDrinkName,
  setManualAmountOz,
  setIsQuickSelectOpen,
  onLog,
  onFavoriteTypedDrink,
  onRemoveFavoriteDrink,
  onPersistFavoriteDrink,
}: ManualLogCardProps) {
  return (
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
          Your bottle: {bottleSizeOz} oz
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
            Number(manualAmountOz) === item.amountOz && !trimmedManualDrinkName.length;

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
        <label className="relative flex-1">
          <span className="sr-only">Drink name</span>
          <input
            type="text"
            maxLength={80}
            value={manualDrinkName}
            onChange={(event) => setManualDrinkName(event.target.value)}
            placeholder="Drink name optional"
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
            void onLog({
              clearCustomDrink: trimmedManualDrinkName.length > 0,
            })
          }
          disabled={isSavingEntry || !accessToken || !canLogManualAmount}
          className="rounded-lg bg-cyan-300 px-6 py-3 text-sm font-bold text-[#071015] transition hover:bg-cyan-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSavingEntry ? "Logging..." : `Log ${canLogManualAmount ? manualAmountOz : ""} oz`}
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
          <span className="text-xs text-slate-500">+</span>
        </button>

        <button
          type="button"
          onClick={() => void onFavoriteTypedDrink()}
          disabled={isSavingFavorite || !accessToken || !trimmedManualDrinkName || !canLogManualAmount}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Favorite typed drink
        </button>
      </div>

      {isQuickSelectOpen ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-[#0b0e13] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Quick select
            </p>
            {isSavingFavorite ? (
              <span className="text-xs text-slate-500">Saving favorites...</span>
            ) : null}
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
                  {drink.name} · {drink.amountOz} oz
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void onPersistFavoriteDrink({
                      key: drink.key,
                      name: drink.name,
                      amountOz: drink.amountOz,
                    })
                  }
                  disabled={isSavingFavorite || !accessToken}
                  aria-label={`Favorite ${drink.name}`}
                  className="border-l border-white/10 px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  ★
                </button>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Favorite one drink to pin it above with your core quick-add buttons. These logs do not change your water target yet.
          </p>
        </div>
      ) : null}
    </section>
  );
}