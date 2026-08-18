import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/api-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { supabase, user } = await getAuthedSupabase(request);
    const { requestId } = await params;
    const body = await request.json();
    const action = String(body.action ?? "");

    if (!requestId) {
      return NextResponse.json(
        { error: "Request ID is required." },
        { status: 400 },
      );
    }

    if (action === "accept") {
      const { data, error } = await supabase
        .from("friendships")
        .update({
          status: "accepted",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("addressee_id", user.id)
        .eq("status", "pending")
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ request: data });
    }

    if (action === "decline") {
      const { data, error } = await supabase
        .from("friendships")
        .update({
          status: "declined",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("addressee_id", user.id)
        .eq("status", "pending")
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ request: data });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}