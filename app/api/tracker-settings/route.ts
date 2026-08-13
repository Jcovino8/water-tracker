import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ownerEmail = process.env.WATER_TRACKER_OWNER_EMAIL?.trim().toLowerCase();

type TrackerSettingsRequest = {
  dailyGoalOz?: unknown;
  bottleSizeOz?: unknown;
  wakeTime?: unknown;
  sleepTime?: unknown;
};

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "You are not authorized to access tracker settings." },
    { status: 401 },
  );
}

async function isOwner(request: Request) {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ") || !ownerEmail) {
    return false;
  }

  const accessToken = authorizationHeader.slice("Bearer ".length);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user?.email) {
    return false;
  }

  return user.email.toLowerCase() === ownerEmail;
}

function isValidTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
  );
}

export async function GET(request: Request) {
  if (!(await isOwner(request))) {
    return unauthorizedResponse();
  }

  const { data, error } = await supabase
    .from("tracker_settings")
    .select(
      "daily_goal_oz, bottle_size_oz, wake_time, sleep_time, updated_at",
    )
    .eq("id", 1)
    .single();

  if (error) {
    console.error("Failed to fetch tracker settings:", error);

    return NextResponse.json(
      { error: "Unable to fetch tracker settings." },
      { status: 500 },
    );
  }

  return NextResponse.json({ settings: data });
}

export async function PATCH(request: Request) {
  if (!(await isOwner(request))) {
    return unauthorizedResponse();
  }

  let body: TrackerSettingsRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const dailyGoalOz = Number(body.dailyGoalOz);
  const bottleSizeOz = Number(body.bottleSizeOz);

  if (
    !Number.isInteger(dailyGoalOz) ||
    dailyGoalOz < 16 ||
    dailyGoalOz > 512
  ) {
    return NextResponse.json(
      { error: "dailyGoalOz must be a whole number between 16 and 512." },
      { status: 400 },
    );
  }

  if (
    !Number.isInteger(bottleSizeOz) ||
    bottleSizeOz < 4 ||
    bottleSizeOz > 128
  ) {
    return NextResponse.json(
      { error: "bottleSizeOz must be a whole number between 4 and 128." },
      { status: 400 },
    );
  }

  if (!isValidTime(body.wakeTime) || !isValidTime(body.sleepTime)) {
    return NextResponse.json(
      { error: "wakeTime and sleepTime must use 24-hour HH:MM format." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("tracker_settings")
    .update({
      daily_goal_oz: dailyGoalOz,
      bottle_size_oz: bottleSizeOz,
      wake_time: body.wakeTime,
      sleep_time: body.sleepTime,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select(
      "daily_goal_oz, bottle_size_oz, wake_time, sleep_time, updated_at",
    )
    .single();

  if (error) {
    console.error("Failed to update tracker settings:", error);

    return NextResponse.json(
      { error: "Unable to save tracker settings." },
      { status: 500 },
    );
  }

  return NextResponse.json({ settings: data });
}