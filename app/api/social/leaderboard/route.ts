import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await getAuthedSupabase(request);
    const days = Number(request.nextUrl.searchParams.get("days") ?? "7");

    const { data, error } = await supabase.rpc("get_friends_leaderboard", {
      days_back: Number.isFinite(days) ? days : 7,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to load leaderboard." },
        { status: 400 },
      );
    }

    return NextResponse.json({ leaderboard: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}