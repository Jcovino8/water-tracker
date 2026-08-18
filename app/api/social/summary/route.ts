import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await getAuthedSupabase(request);

    const { data, error } = await supabase.rpc("get_social_summary");

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to load social summary." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      data ?? {
        incomingRequests: [],
        outgoingRequests: [],
        friends: [],
        groups: [],
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}