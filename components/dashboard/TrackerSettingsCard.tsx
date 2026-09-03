import { FormEvent } from "react";

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

type TrackerSettingsCardProps = {
  settings: TrackerSettings;
  draftSettings: TrackerSettings;
  isSettingsOpen: boolean;
  isSavingSettings: boolean;
  setIsSettingsOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setDraftSettings: (
    value:
      | TrackerSettings
      | ((currentSettings: TrackerSettings) => TrackerSettings),
  ) => void;
  saveSettings: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  cancelSettings: () => void;
};

export default function TrackerSettingsCard({
  settings,
  draftSettings,
  isSettingsOpen,
  isSavingSettings,
  setIsSettingsOpen,
  setDraftSettings,
  saveSettings,
  cancelSettings,
}: TrackerSettingsCardProps) {
  return (
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

      {isSettingsOpen ? (
        <form className="mt-6 space-y-4 border-t border-white/10 pt-5" onSubmit={saveSettings}>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Daily goal oz</span>
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
                className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-2.5 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-300">Bottle size oz</span>
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
                className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-2.5 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
              />
            </label>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
            <p className="text-sm font-medium text-white">Favorite quick adds</p>
            <p className="mt-1 text-sm text-slate-400">
              Favorite drinks from the dashboard quick select area. They stay pinned across future sessions until removed.
            </p>

            {draftSettings.favoriteDrinks.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {draftSettings.favoriteDrinks.map((drink) => (
                  <div
                    key={drink.key}
                    className="flex items-center gap-2 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.05] px-3 py-2"
                  >
                    <p className="text-sm text-slate-200">
                      {drink.name} · {drink.amountOz} oz
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
              {isSavingSettings ? "Saving..." : "Save settings"}
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
      ) : null}
    </section>
  );
}