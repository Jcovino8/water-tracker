import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getSupabase(accessToken: string) {
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return { error: "Missing access token.", status: 401 as const };
  }

  const supabase = getSupabase(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: error?.message || "Unauthorized.",
      status: 401 as const,
    };
  }

  return { user, supabase };
}

function normalizeNullableText(value: unknown, maxLength: number) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized.slice(0, maxLength) : null;
}

export async function GET(request: NextRequest) {
  try {
    const result = await getUserFromRequest(request);

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    const { user, supabase } = result;

    const [profileResult, entriesResult, settingsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "display_name, username, bio, avatar_url, friends_can_view_summary, gender, height_inches, weight_lbs",
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("water_entries")
        .select("id, created_at, amount_oz, source, bottle_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("tracker_settings")
        .select(
          "daily_goal_oz, bottle_size_oz, favorite_drink_key, favorite_drink_name, favorite_drink_oz, updated_at",
        )
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      return NextResponse.json(
        { error: `Profile query failed: ${profileResult.error.message}` },
        { status: 500 },
      );
    }

    if (entriesResult.error) {
      return NextResponse.json(
        { error: `Entries query failed: ${entriesResult.error.message}` },
        { status: 500 },
      );
    }

    if (settingsResult.error) {
      return NextResponse.json(
        { error: `Settings query failed: ${settingsResult.error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      profile: profileResult.data ?? {
        display_name: "",
        username: "",
        bio: "",
        avatar_url: null,
        friends_can_view_summary: false,
        gender: null,
        height_inches: null,
        weight_lbs: null,
      },
      entries: entriesResult.data ?? [],
      settings: settingsResult.data ?? {
        daily_goal_oz: 128,
        bottle_size_oz: 25,
        favorite_drink_key: null,
        favorite_drink_name: null,
        favorite_drink_oz: null,
        updated_at: null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown profile GET error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const result = await getUserFromRequest(request);

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    const { user, supabase } = result;
    const body = await request.json();

    const displayName = normalizeNullableText(body.displayName, 80);
    const username = normalizeNullableText(body.username, 24)?.toLowerCase() ?? null;
    const bio = normalizeNullableText(body.bio, 280);
    const avatarUrl =
      body.avatarUrl == null || body.avatarUrl === ""
        ? null
        : String(body.avatarUrl).trim();
    const friendsCanViewSummary = Boolean(body.friendsCanViewSummary ?? false);

    const allowedGenders = new Set([
      "male",
      "female",
      "nonbinary",
      "prefer_not_to_say",
    ]);

    const gender =
      body.gender == null || body.gender === ""
        ? null
        : String(body.gender).trim();

    const heightInches =
      body.heightInches == null || body.heightInches === ""
        ? null
        : Number(body.heightInches);

    const weightLbs =
      body.weightLbs == null || body.weightLbs === ""
        ? null
        : Number(body.weightLbs);

    if (username && !/^[a-z0-9_]+$/.test(username)) {
      return NextResponse.json(
        {
          error:
            "Username can only contain lowercase letters, numbers, and underscores.",
        },
        { status: 400 },
      );
    }

    if (gender && !allowedGenders.has(gender)) {
      return NextResponse.json(
        { error: "Gender value is invalid." },
        { status: 400 },
      );
    }

    if (
      heightInches != null &&
      (!Number.isFinite(heightInches) || heightInches < 36 || heightInches > 108)
    ) {
      return NextResponse.json(
        { error: "Height must be between 36 and 108 inches." },
        { status: 400 },
      );
    }

    if (
      weightLbs != null &&
      (!Number.isFinite(weightLbs) || weightLbs < 60 || weightLbs > 700)
    ) {
      return NextResponse.json(
        { error: "Weight must be between 60 and 700 pounds." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        display_name: displayName,
        username,
        bio,
        avatar_url: avatarUrl,
        friends_can_view_summary: friendsCanViewSummary,
        gender,
        height_inches: heightInches == null ? null : Number(heightInches.toFixed(2)),
        weight_lbs: weightLbs == null ? null : Number(weightLbs.toFixed(2)),
        updated_at: new Date().toISOString(),
      })
      .select(
        "display_name, username, bio, avatar_url, friends_can_view_summary, gender, height_inches, weight_lbs",
      )
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Profile update failed: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown profile PATCH error",
      },
      { status: 500 },
    );
  }
}