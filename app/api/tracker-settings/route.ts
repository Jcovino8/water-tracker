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
  favoriteDrinks?: unknown;
};

type NormalizedFavoriteDrink = {
  key: string;
  name: string;
  amountOz: number;
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

function normalizeFavoriteDrink(input: FavoriteDrinkRequest): NormalizedFavoriteDrink {
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
      "Each favorite drink must include a valid key, name, and amountOz between 0.1 and 128.",
    );
  }

  return {
    key,
    name,
    amountOz: Number(amountOz.toFixed(1)),
  };
}

function normalizeFavoriteDrinks(input: unknown): NormalizedFavoriteDrink[] {
  if (input == null) {
    return [];
  }

  if (!Array.isArray(input)) {
    throw new Error("favoriteDrinks must be an array.");
  }

  const normalized = input.map((item) =>
    normalizeFavoriteDrink((item ?? {}) as FavoriteDrinkRequest),
  );

  const deduped = new Map<string, NormalizedFavoriteDrink>();

  for (const drink of normalized) {
    deduped.set(drink.key, drink);
  }

  return Array.from(deduped.values()).slice(0, 24);
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const { data, error } = await supabase
    .from("tracker_settings")
    .select("daily_goal_oz, bottle_size_oz, favorite_drinks, updated_at")
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
        favorite_drinks: [],
      })
      .select("daily_goal_oz, bottle_size_oz, favorite_drinks, updated_at")
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

  return NextResponse.json({
    settings: {
      ...data,
      favorite_drinks: Array.isArray(data.favorite_drinks) ? data.favorite_drinks : [],
    },
  });
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

  if (!Number.isInteger(dailyGoalOz) || dailyGoalOz < 16 || dailyGoalOz > 512) {
    return NextResponse.json(
      { error: "dailyGoalOz must be a whole number between 16 and 512." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(bottleSizeOz) || bottleSizeOz < 4 || bottleSizeOz > 128) {
    return NextResponse.json(
      { error: "bottleSizeOz must be a whole number between 4 and 128." },
      { status: 400 },
    );
  }

  let favoriteDrinks: NormalizedFavoriteDrink[];

  try {
    favoriteDrinks = normalizeFavoriteDrinks(body.favoriteDrinks);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "favoriteDrinks is invalid.",
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
      favorite_drinks: favoriteDrinks,
      updated_at: new Date().toISOString(),
    })
    .select("daily_goal_oz, bottle_size_oz, favorite_drinks, updated_at")
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