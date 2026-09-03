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
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
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

function CustomDot(props: { cx?: number; cy?: number; payload?: TrendDay }) {
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

type HydrationSnapshotCardProps = {
  snapshotMode: SnapshotMode;
  snapshotLabel: string;
  snapshotSubcopy: string;
  selectedMonthKey: string;
  todayMonthKey: string;
  earliestHistoryMonth: string;
  weeklyDays: TrendDay[];
  monthlyCalendarDays: CalendarDay[];
  settingsDailyGoalOz: number;
  chartTop: number;
  chartTicks: number[];
  switchSnapshotMode: (nextMode: SnapshotMode) => Promise<void>;
  jumpMonth: (direction: "previous" | "next") => Promise<void>;
  formatMonthLabel: (monthKey: string) => string;
};

export default function HydrationSnapshotCard({
  snapshotMode,
  snapshotLabel,
  snapshotSubcopy,
  selectedMonthKey,
  todayMonthKey,
  earliestHistoryMonth,
  weeklyDays,
  monthlyCalendarDays,
  settingsDailyGoalOz,
  chartTop,
  chartTicks,
  switchSnapshotMode,
  jumpMonth,
  formatMonthLabel,
}: HydrationSnapshotCardProps) {
  return (
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

          {snapshotMode === "monthly" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void jumpMonth("previous")}
                disabled={selectedMonthKey === earliestHistoryMonth}
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
          ) : null}
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
                content={<TrendTooltip dailyGoalOz={settingsDailyGoalOz} />}
              />
              <ReferenceLine
                y={settingsDailyGoalOz}
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
                      ? "border-cyan-300/40 bg-cyan-300/[0.05]"
                      : "border-white/10 bg-[#0b0e13]"
                    : "border-transparent bg-transparent"
                }`}
              >
                {day.isCurrentMonth ? (
                  <div className="flex h-full flex-col">
                    <div className="flex items-start justify-between">
                      <span
                        className={`text-xs font-semibold ${
                          day.isToday ? "text-cyan-200" : "text-slate-400"
                        }`}
                      >
                        {day.dayNumber}
                      </span>
                      {day.ounces > 0 ? (
                        <span className="text-[10px] font-medium text-slate-500">
                          {Number.isInteger(day.ounces) ? day.ounces : day.ounces.toFixed(1)} oz
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-1 items-center justify-center">
                      <DayProgressDonut
                        ounces={day.ounces}
                        goalOz={settingsDailyGoalOz}
                        isToday={day.isToday}
                      />
                    </div>
                  </div>
                ) : null}
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
  );
}