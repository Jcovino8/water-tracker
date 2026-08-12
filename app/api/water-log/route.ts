import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const expectedNfcToken = process.env.WATER_TRACKER_NFC_TOKEN?.trim();
const ownerEmail = process.env.WATER_TRACKER_OWNER_EMAIL?.trim().toLowerCase();

type AuthorizationType = "nfc" | "owner";

type WaterLogRequest = {
  amountOz?: unknown;
  source?: unknown;
  bottleName?: unknown;
};

async function getAuthorizationType(
  request: Request,
  allowNfcToken: boolean,
): Promise<AuthorizationType | null> {
  const providedNfcToken = request.headers.get("x-water-tracker-token");

  if (
    allowNfcToken &&
    expectedNfcToken &&
    providedNfcToken === expectedNfcToken
  ) {
    return "nfc";
  }

  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ") || !ownerEmail) {
    return null;
  }

  const accessToken = authorizationHeader.slice("Bearer ".length);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user?.email) {
    return null;
  }

  return user.email.toLowerCase() === ownerEmail ? "owner" : null;
}

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "You are not authorized to access this tracker." },
    { status: 401 },
  );
}

function getEasternDateKey(timestamp: string) {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = dateFormatter.formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export async function GET(request: Request) {
  const authorizationType = await getAuthorizationType(request, false);

  if (authorizationType !== "owner") {
    return unauthorizedResponse();
  }

  const todayEastern = getEasternDateKey(new Date().toISOString());

  const { data, error } = await supabase
    .from("water_entries")
    .select("id, created_at, amount_oz, source, bottle_name")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch water entries:", error);

    return NextResponse.json(
      { error: "Unable to fetch water entries." },
      { status: 500 },
    );
  }

  const todayEntries = data.filter(
    (entry) => getEasternDateKey(entry.created_at) === todayEastern,
  );

  return NextResponse.json({ entries: todayEntries });
}

export async function POST(request: Request) {
  const authorizationType = await getAuthorizationType(request, true);

  if (!authorizationType) {
    return unauthorizedResponse();
  }

  let body: WaterLogRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const amountOz = Number(body.amountOz);
  const bottleName =
    typeof body.bottleName === "string" && body.bottleName.trim()
      ? body.bottleName.trim()
      : "CEMC";

  const source =
    authorizationType === "nfc"
      ? "nfc"
      : body.source === "nfc"
        ? "nfc"
        : "manual";

  if (!Number.isFinite(amountOz) || amountOz <= 0 || amountOz > 256) {
    return NextResponse.json(
      { error: "amountOz must be a number between 0 and 256." },
      { status: 400 },
    );
  }

  const duplicateCutoff = new Date(Date.now() - 15_000).toISOString();

  const { data: recentEntries, error: duplicateCheckError } = await supabase
    .from("water_entries")
    .select("id, created_at, amount_oz, source, bottle_name")
    .eq("amount_oz", amountOz)
    .eq("source", source)
    .eq("bottle_name", bottleName)
    .gte("created_at", duplicateCutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  if (duplicateCheckError) {
    console.error("Failed duplicate-tap check:", duplicateCheckError);

    return NextResponse.json(
      { error: "Unable to validate recent water entries." },
      { status: 500 },
    );
  }

  if (recentEntries.length > 0) {
    return NextResponse.json({
      entry: recentEntries[0],
      duplicate: true,
    });
  }

  const { data, error } = await supabase
    .from("water_entries")
    .insert({
      amount_oz: amountOz,
      source,
      bottle_name: bottleName,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to insert water entry:", error);

    return NextResponse.json(
      { error: "Unable to save water entry." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      entry: data,
      duplicate: false,
    },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const authorizationType = await getAuthorizationType(request, false);

  if (authorizationType !== "owner") {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get("id");

  if (!entryId) {
    return NextResponse.json(
      { error: "An entry id is required." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("water_entries")
    .delete()
    .eq("id", entryId)
    .select("id")
    .single();

  if (error) {
    console.error("Failed to delete water entry:", error);

    return NextResponse.json(
      { error: "Unable to delete water entry." },
      { status: 500 },
    );
  }

  return NextResponse.json({ deletedEntryId: data.id });
}