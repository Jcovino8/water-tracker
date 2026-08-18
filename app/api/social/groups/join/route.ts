import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthedSupabase(request);
    const body = await request.json();
    const joinCode = String(body.joinCode ?? "").trim().toUpperCase();

    if (!joinCode) {
      return NextResponse.json(
        { error: "Join code is required." },
        { status: 400 },
      );
    }

    const { data: group, error: groupError } = await supabase
      .from("social_groups")
      .select("id, name, join_code")
      .eq("join_code", joinCode)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    const { error: joinError } = await supabase
      .from("social_group_members")
      .upsert(
        {
          group_id: group.id,
          user_id: user.id,
          role: "member",
        },
        { onConflict: "group_id,user_id" },
      );

    if (joinError) {
      return NextResponse.json({ error: joinError.message }, { status: 400 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}