import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthedSupabase(request);
    const body = await request.json();
    const username = String(body.username ?? "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();

    if (!username) {
      return NextResponse.json(
        { error: "Username is required." },
        { status: 400 },
      );
    }

    const { data: receiverProfile, error: receiverError } = await supabase
      .from("profiles")
      .select("user_id, username")
      .ilike("username", username)
      .limit(1)
      .maybeSingle();

    if (receiverError) {
      return NextResponse.json({ error: receiverError.message }, { status: 400 });
    }

    if (!receiverProfile?.user_id) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (receiverProfile.user_id === user.id) {
      return NextResponse.json(
        { error: "You cannot add yourself." },
        { status: 400 },
      );
    }

    const { data: existing } = await supabase
      .from("friendships")
      .select("id, status")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${receiverProfile.user_id}),and(requester_id.eq.${receiverProfile.user_id},addressee_id.eq.${user.id})`,
      )
      .in("status", ["pending", "accepted"])
      .limit(1)
      .maybeSingle();

    if (existing?.status === "accepted") {
      return NextResponse.json(
        { error: "You are already friends." },
        { status: 409 },
      );
    }

    if (existing?.status === "pending") {
      return NextResponse.json(
        { error: "A pending friend request already exists." },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("friendships")
      .insert({
        requester_id: user.id,
        addressee_id: receiverProfile.user_id,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ request: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}