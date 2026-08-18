import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/api-auth";

function makeJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthedSupabase(request);
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim();

    if (name.length < 2) {
      return NextResponse.json(
        { error: "Group name must be at least 2 characters." },
        { status: 400 },
      );
    }

    let createdGroup: {
      id: string;
      name: string;
      description: string;
      join_code: string;
      owner_id: string;
    } | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const joinCode = makeJoinCode();

      const { data, error } = await supabase
        .from("social_groups")
        .insert({
          owner_id: user.id,
          name,
          description,
          join_code: joinCode,
        })
        .select("id, name, description, join_code, owner_id")
        .single();

      if (!error && data) {
        createdGroup = data;
        break;
      }
    }

    if (!createdGroup) {
      return NextResponse.json(
        { error: "Could not create group." },
        { status: 400 },
      );
    }

    const { error: memberError } = await supabase
      .from("social_group_members")
      .insert({
        group_id: createdGroup.id,
        user_id: user.id,
        role: "owner",
      });

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }

    return NextResponse.json({ group: createdGroup });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}