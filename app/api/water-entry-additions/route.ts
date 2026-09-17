import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type AdditionRequest = {
  waterEntryId?: unknown;
  additionName?: unknown;
  servingCount?: unknown;
};

type AuthorizedUser = {
  id: string;
};

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "You are not authorized to access this tracker." },
    { status: 401 },
  );
}

async function getOwnerUser(request: Request): Promise<AuthorizedUser | null> {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  const accessToken = authorizationHeader.slice("Bearer ".length);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user?.id) {
    return null;
  }

  return { id: user.id };
}

export async function POST(request: Request) {
  const user = await getOwnerUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  let body: AdditionRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const waterEntryId =
    typeof body.waterEntryId === "string" ? body.waterEntryId.trim() : "";

  const additionName =
    typeof body.additionName === "string"
      ? body.additionName.trim().slice(0, 80)
      : "";

  const servingCount =
    body.servingCount == null ? 1 : Number(body.servingCount);

  if (!waterEntryId) {
    return NextResponse.json(
      { error: "A water entry is required." },
      { status: 400 },
    );
  }

  if (!additionName) {
    return NextResponse.json(
      { error: "An electrolyte mix name is required." },
      { status: 400 },
    );
  }

  if (
    !Number.isFinite(servingCount) ||
    servingCount <= 0 ||
    servingCount > 20
  ) {
    return NextResponse.json(
      { error: "servingCount must be between 0.1 and 20." },
      { status: 400 },
    );
  }

  const { data: waterEntry, error: waterEntryError } = await supabase
    .from("water_entries")
    .select("id, user_id, amount_oz, source, bottle_name, created_at")
    .eq("id", waterEntryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (waterEntryError) {
    console.error("Failed to validate water entry:", waterEntryError);

    return NextResponse.json(
      { error: "Unable to validate the selected water entry." },
      { status: 500 },
    );
  }

  if (!waterEntry) {
    return NextResponse.json(
      { error: "The selected water entry was not found." },
      { status: 404 },
    );
  }

  const { data: addition, error: insertError } = await supabase
    .from("water_entry_additions")
    .insert({
      water_entry_id: waterEntry.id,
      user_id: user.id,
      addition_name: additionName,
      addition_type: "electrolyte_mix",
      serving_count: Number(servingCount.toFixed(1)),
    })
    .select("id, water_entry_id, addition_name, addition_type, serving_count, created_at")
    .single();

  if (insertError) {
    console.error("Failed to save water entry addition:", insertError);

    return NextResponse.json(
      { error: "Unable to save the electrolyte mix." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      addition,
      waterEntry,
    },
    { status: 201 },
  );
}