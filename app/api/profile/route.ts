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
        .select("display_name, username, bio, avatar_url, friends_can_view_summary")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("water_entries")
        .select("id, created_at, amount_oz, source, bottle_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("tracker_settings")
        .select("daily_goal_oz, bottle_size_oz, wake_time, sleep_time, updated_at")
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
      },
      entries: entriesResult.data ?? [],
      settings: settingsResult.data ?? {
        daily_goal_oz: 128,
        bottle_size_oz: 25,
        wake_time: "07:00:00",
        sleep_time: "23:00:00",
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

    const displayName = String(body.displayName ?? "").trim();
    const username = String(body.username ?? "").trim().toLowerCase();
    const bio = String(body.bio ?? "").trim();
    const avatarUrl =
      body.avatarUrl == null || body.avatarUrl === ""
        ? null
        : String(body.avatarUrl).trim();
    const friendsCanViewSummary = Boolean(body.friendsCanViewSummary ?? false);

    if (username && !/^[a-z0-9_]+$/.test(username)) {
      return NextResponse.json(
        {
          error:
            "Username can only contain lowercase letters, numbers, and underscores.",
        },
        { status: 400 },
      );
    }

    if (bio.length > 280) {
      return NextResponse.json(
        { error: "Bio must be 280 characters or fewer." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        display_name: displayName || null,
        username: username || null,
        bio: bio || null,
        avatar_url: avatarUrl,
        friends_can_view_summary: friendsCanViewSummary,
        updated_at: new Date().toISOString(),
      })
      .select(
        "display_name, username, bio, avatar_url, friends_can_view_summary",
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