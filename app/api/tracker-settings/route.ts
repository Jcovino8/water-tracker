import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type TrackerSettingsRequest = {
  dailyGoalOz?: unknown;
  bottleSizeOz?: unknown;
};

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "You are not authorized to access tracker settings." },
    { status: 401 },
  );
}

async function getAuthenticatedUser(request: Request) {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  const accessToken = authorizationHeader.slice("Bearer ".length);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return user;
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const { data, error } = await supabase
    .from("tracker_settings")
    .select("daily_goal_oz, bottle_size_oz, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch tracker settings:", error);

    return NextResponse.json(
      { error: "Unable to fetch tracker settings." },
      { status: 500 },
    );
  }

  if (!data) {
    const { data: insertedSettings, error: insertError } = await supabase
      .from("tracker_settings")
      .insert({
        id: user.id,
        daily_goal_oz: 128,
        bottle_size_oz: 25,
      })
      .select("daily_goal_oz, bottle_size_oz, updated_at")
      .single();

    if (insertError) {
      console.error("Failed to create tracker settings:", insertError);

      return NextResponse.json(
        { error: "Unable to create tracker settings." },
        { status: 500 },
      );
    }

    return NextResponse.json({ settings: insertedSettings });
  }

  return NextResponse.json({ settings: data });
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
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

  const { data, error } = await supabase
    .from("tracker_settings")
    .upsert({
      id: user.id,
      daily_goal_oz: dailyGoalOz,
      bottle_size_oz: bottleSizeOz,
      updated_at: new Date().toISOString(),
    })
    .select("daily_goal_oz, bottle_size_oz, updated_at")
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