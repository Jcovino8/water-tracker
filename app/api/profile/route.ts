import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ownerEmail = process.env.WATER_TRACKER_OWNER_EMAIL?.trim().toLowerCase();

type ProfileUpdateRequest = {
  displayName?: unknown;
  username?: unknown;
  bio?: unknown;
  friendsCanViewSummary?: unknown;
};

type AchievementDefinition = {
  key: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
};

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "You are not authorized to access this profile." },
    { status: 401 },
  );
}

async function getOwnerUser(request: Request) {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ") || !ownerEmail) {
    return null;
  }

  const accessToken = authorizationHeader.slice("Bearer ".length);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user?.id || !user.email) {
    return null;
  }

  if (user.email.toLowerCase() !== ownerEmail) {
    return null;
  }

  return user;
}

function getEasternDateKey(timestamp: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getEasternDateDaysAgo(daysAgo: number) {
  const todayEastern = getEasternDateKey(new Date().toISOString());
  const date = new Date(`${todayEastern}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);

  return date.toISOString().slice(0, 10);
}

function calculateStreak(
  dailyTotals: Record<string, number>,
  dailyGoalOz: number,
) {
  let streak = 0;

  for (let daysAgo = 0; daysAgo < 3650; daysAgo += 1) {
    const dateKey = getEasternDateDaysAgo(daysAgo);

    if ((dailyTotals[dateKey] ?? 0) < dailyGoalOz) {
      break;
    }

    streak += 1;
  }

  return streak;
}

function calculateLongestStreak(
  dailyTotals: Record<string, number>,
  dailyGoalOz: number,
) {
  const sortedDates = Object.keys(dailyTotals).sort();

  let longestStreak = 0;
  let currentStreak = 0;
  let previousDateKey: string | null = null;

  for (const dateKey of sortedDates) {
    const completedGoal = dailyTotals[dateKey] >= dailyGoalOz;

    if (!completedGoal) {
      currentStreak = 0;
      previousDateKey = dateKey;
      continue;
    }

    if (!previousDateKey) {
      currentStreak = 1;
    } else {
      const previousDate = new Date(`${previousDateKey}T12:00:00.000Z`);
      previousDate.setUTCDate(previousDate.getUTCDate() + 1);

      const expectedDateKey = previousDate.toISOString().slice(0, 10);

      currentStreak =
        dateKey === expectedDateKey ? currentStreak + 1 : 1;
    }

    longestStreak = Math.max(longestStreak, currentStreak);
    previousDateKey = dateKey;
  }

  return longestStreak;
}

async function updateAccomplishments(
  userId: string,
  totalEntries: number,
  totalOunces: number,
  currentStreak: number,
) {
  const unlockedKeys: string[] = [];

  if (totalEntries >= 1) {
    unlockedKeys.push("first_drop");
  }

  if (currentStreak >= 3) {
    unlockedKeys.push("three_day_flow");
  }

  if (currentStreak >= 7) {
    unlockedKeys.push("weekly_wave");
  }

  if (currentStreak >= 14) {
    unlockedKeys.push("consistency_current");
  }

  if (currentStreak >= 30) {
    unlockedKeys.push("hydration_habit");
  }

  if (totalOunces >= 1000) {
    unlockedKeys.push("deep_dive");
  }

  if (unlockedKeys.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("user_accomplishments")
    .upsert(
      unlockedKeys.map((accomplishmentKey) => ({
        user_id: userId,
        accomplishment_key: accomplishmentKey,
      })),
      {
        onConflict: "user_id,accomplishment_key",
        ignoreDuplicates: true,
      },
    );

  if (error) {
    console.error("Unable to update accomplishments:", error);
  }
}

export async function GET(request: Request) {
  const user = await getOwnerUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const [{ data: profile, error: profileError }, { data: settings, error: settingsError }, { data: entries, error: entriesError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, username, display_name, bio, friends_can_view_summary, created_at",
        )
        .eq("id", user.id)
        .single(),
      supabase
        .from("tracker_settings")
        .select("daily_goal_oz")
        .eq("id", 1)
        .single(),
      supabase
        .from("water_entries")
        .select("created_at, amount_oz")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

  if (profileError || settingsError || entriesError || !profile || !settings) {
    console.error({
      profileError,
      settingsError,
      entriesError,
    });

    return NextResponse.json(
      { error: "Unable to load profile data." },
      { status: 500 },
    );
  }

  const dailyGoalOz = Number(settings.daily_goal_oz);

  const dailyTotals = entries.reduce<Record<string, number>>(
    (totals, entry) => {
      const dateKey = getEasternDateKey(entry.created_at);

      totals[dateKey] =
        (totals[dateKey] ?? 0) + Number(entry.amount_oz);

      return totals;
    },
    {},
  );

  const totalEntries = entries.length;
  const totalOunces = entries.reduce(
    (total, entry) => total + Number(entry.amount_oz),
    0,
  );

  const currentStreak = calculateStreak(dailyTotals, dailyGoalOz);
  const longestStreak = calculateLongestStreak(dailyTotals, dailyGoalOz);

  await updateAccomplishments(
    user.id,
    totalEntries,
    totalOunces,
    currentStreak,
  );

  const { data: unlockedAccomplishments, error: accomplishmentsError } =
    await supabase
      .from("user_accomplishments")
      .select("accomplishment_key, unlocked_at")
      .eq("user_id", user.id);

  if (accomplishmentsError) {
    console.error("Unable to fetch accomplishments:", accomplishmentsError);

    return NextResponse.json(
      { error: "Unable to load accomplishments." },
      { status: 500 },
    );
  }

  const unlockedByKey = new Map(
    unlockedAccomplishments.map((achievement) => [
      achievement.accomplishment_key,
      achievement.unlocked_at,
    ]),
  );

  const accomplishments: AchievementDefinition[] = [
    {
      key: "first_drop",
      title: "First Drop",
      description: "Log your first bottle.",
      unlocked: unlockedByKey.has("first_drop"),
      unlockedAt: unlockedByKey.get("first_drop") ?? null,
    },
    {
      key: "three_day_flow",
      title: "Three-Day Flow",
      description: "Reach your goal 3 days in a row.",
      unlocked: unlockedByKey.has("three_day_flow"),
      unlockedAt: unlockedByKey.get("three_day_flow") ?? null,
    },
    {
      key: "weekly_wave",
      title: "Weekly Wave",
      description: "Reach your goal 7 days in a row.",
      unlocked: unlockedByKey.has("weekly_wave"),
      unlockedAt: unlockedByKey.get("weekly_wave") ?? null,
    },
    {
      key: "consistency_current",
      title: "Consistency Current",
      description: "Reach your goal 14 days in a row.",
      unlocked: unlockedByKey.has("consistency_current"),
      unlockedAt:
        unlockedByKey.get("consistency_current") ?? null,
    },
    {
      key: "hydration_habit",
      title: "Hydration Habit",
      description: "Reach your goal 30 days in a row.",
      unlocked: unlockedByKey.has("hydration_habit"),
      unlockedAt: unlockedByKey.get("hydration_habit") ?? null,
    },
    {
      key: "deep_dive",
      title: "Deep Dive",
      description: "Log 1,000 total ounces.",
      unlocked: unlockedByKey.has("deep_dive"),
      unlockedAt: unlockedByKey.get("deep_dive") ?? null,
    },
  ];

  return NextResponse.json({
    profile: {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      bio: profile.bio,
      friendsCanViewSummary: profile.friends_can_view_summary,
      createdAt: profile.created_at,
      email: user.email,
    },
    stats: {
      totalEntries,
      totalOunces,
      currentStreak,
      longestStreak,
      dailyGoalOz,
    },
    accomplishments,
  });
}

export async function PATCH(request: Request) {
  const user = await getOwnerUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  let body: ProfileUpdateRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const displayName =
    typeof body.displayName === "string"
      ? body.displayName.trim()
      : null;

  const username =
    typeof body.username === "string"
      ? body.username.trim().toLowerCase()
      : null;

  const bio = typeof body.bio === "string" ? body.bio.trim() : null;

  const friendsCanViewSummary =
    typeof body.friendsCanViewSummary === "boolean"
      ? body.friendsCanViewSummary
      : null;

  if (!displayName || displayName.length < 1 || displayName.length > 60) {
    return NextResponse.json(
      { error: "Display name must be between 1 and 60 characters." },
      { status: 400 },
    );
  }

  if (
    username &&
    !/^[a-z0-9_]{3,24}$/.test(username)
  ) {
    return NextResponse.json(
      {
        error:
          "Username must use 3–24 lowercase letters, numbers, or underscores.",
      },
      { status: 400 },
    );
  }

  if (bio && bio.length > 160) {
    return NextResponse.json(
      { error: "Bio must be 160 characters or fewer." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      username: username || null,
      bio: bio || "",
      friends_can_view_summary:
        friendsCanViewSummary ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select(
      "id, username, display_name, bio, friends_can_view_summary, created_at",
    )
    .single();

  if (error) {
    console.error("Unable to update profile:", error);

    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "That username is already taken."
            : "Unable to save profile.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    profile: {
      id: data.id,
      username: data.username,
      displayName: data.display_name,
      bio: data.bio,
      friendsCanViewSummary: data.friends_can_view_summary,
      createdAt: data.created_at,
      email: user.email,
    },
  });
}