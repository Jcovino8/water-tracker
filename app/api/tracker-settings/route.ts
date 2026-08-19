import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type FavoriteDrinkRequest = {
  key?: unknown;
  name?: unknown;
  amountOz?: unknown;
};

type TrackerSettingsRequest = {
  dailyGoalOz?: unknown;
  bottleSizeOz?: unknown;
  favoriteDrink?: FavoriteDrinkRequest | null;
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

function normalizeFavoriteDrink(input: FavoriteDrinkRequest | null | undefined) {
  if (!input) {
    return {
      favorite_drink_key: null,
      favorite_drink_name: null,
      favorite_drink_oz: null,
    };
  }

  const key =
    typeof input.key === "string" && input.key.trim().length > 0
      ? input.key.trim().slice(0, 64)
      : null;

  const name =
    typeof input.name === "string" && input.name.trim().length > 0
      ? input.name.trim().slice(0, 80)
      : null;

  const amountOz = Number(input.amountOz);

  if (!key || !name || !Number.isFinite(amountOz) || amountOz <= 0 || amountOz > 128) {
    throw new Error(
      "favoriteDrink must include a valid key, name, and amountOz between 0.1 and 128.",
    );
  }

  return {
    favorite_drink_key: key,
    favorite_drink_name: name,
    favorite_drink_oz: Number(amountOz.toFixed(1)),
  };
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const { data, error } = await supabase
    .from("tracker_settings")
    .select(
      "daily_goal_oz, bottle_size_oz, favorite_drink_key, favorite_drink_name, favorite_drink_oz, updated_at",
    )
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
        favorite_drink_key: null,
        favorite_drink_name: null,
        favorite_drink_oz: null,
      })
      .select(
        "daily_goal_oz, bottle_size_oz, favorite_drink_key, favorite_drink_name, favorite_drink_oz, updated_at",
      )
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

  let favoriteDrinkColumns: {
    favorite_drink_key: string | null;
    favorite_drink_name: string | null;
    favorite_drink_oz: number | null;
  };

  try {
    favoriteDrinkColumns = normalizeFavoriteDrink(body.favoriteDrink);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "favoriteDrink is invalid.",
      },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("tracker_settings")
    .upsert({
      id: user.id,
      daily_goal_oz: dailyGoalOz,
      bottle_size_oz: bottleSizeOz,
      ...favoriteDrinkColumns,
      updated_at: new Date().toISOString(),
    })
    .select(
      "daily_goal_oz, bottle_size_oz, favorite_drink_key, favorite_drink_name, favorite_drink_oz, updated_at",
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