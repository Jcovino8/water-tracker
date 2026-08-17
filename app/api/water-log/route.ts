import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const expectedNfcToken = process.env.WATER_TRACKER_NFC_TOKEN?.trim();
const ownerEmail = process.env.WATER_TRACKER_OWNER_EMAIL?.trim().toLowerCase();

type AuthorizationType = "nfc" | "owner";

type AuthorizedUser = {
  id: string;
  email: string;
};

type WaterLogRequest = {
  amountOz?: unknown;
  source?: unknown;
  bottleName?: unknown;
};

async function getOwnerUser(
  request: Request,
): Promise<AuthorizedUser | null> {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ") || !ownerEmail) {
    return null;
  }

  const accessToken = authorizationHeader.slice("Bearer ".length);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user?.id || !user.email) {
    return null;
  }

  if (user.email.toLowerCase() !== ownerEmail) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
}

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

  const ownerUser = await getOwnerUser(request);

  return ownerUser ? "owner" : null;
}

async function getEntryOwner(
  request: Request,
  authorizationType: AuthorizationType,
): Promise<AuthorizedUser | null> {
  if (authorizationType === "owner") {
    return getOwnerUser(request);
  }

  if (!ownerEmail) {
    return null;
  }

  const {
    data: { users },
    error,
  } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  if (error) {
    console.error("Unable to find NFC entry owner:", error);
    return null;
  }

  const owner = users.find(
    (user) => user.email?.toLowerCase() === ownerEmail,
  );

  if (!owner?.id || !owner.email) {
    return null;
  }

  return {
    id: owner.id,
    email: owner.email,
  };
}

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "You are not authorized to access this tracker." },
    { status: 401 },
  );
}

function getEasternDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getEasternDateKeys(days: number) {
  const keys: string[] = [];
  const now = new Date();

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - offset);
    keys.push(getEasternDateKey(day));
  }

  return new Set(keys);
}

export async function GET(request: Request) {
  const ownerUser = await getOwnerUser(request);

  if (!ownerUser) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const daysParam = searchParams.get("days") ?? "1";
  const days = Number(daysParam);

  if (!Number.isInteger(days) || days < 1 || days > 30) {
    return NextResponse.json(
      { error: "days must be a whole number between 1 and 30." },
      { status: 400 },
    );
  }

  const easternDateKeys = getEasternDateKeys(days);

  const { data, error } = await supabase
    .from("water_entries")
    .select("id, created_at, amount_oz, source, bottle_name")
    .eq("user_id", ownerUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch water entries:", error);

    return NextResponse.json(
      { error: "Unable to fetch water entries." },
      { status: 500 },
    );
  }

  const entries = data.filter((entry) =>
    easternDateKeys.has(getEasternDateKey(entry.created_at)),
  );

  return NextResponse.json({
    days,
    entries,
  });
}

export async function POST(request: Request) {
  const authorizationType = await getAuthorizationType(request, true);

  if (!authorizationType) {
    return unauthorizedResponse();
  }

  const entryOwner = await getEntryOwner(request, authorizationType);

  if (!entryOwner) {
    return NextResponse.json(
      { error: "Unable to determine the owner of this water entry." },
      { status: 500 },
    );
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
    .eq("user_id", entryOwner.id)
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
      user_id: entryOwner.id,
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
  const ownerUser = await getOwnerUser(request);

  if (!ownerUser) {
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
    .eq("user_id", ownerUser.id)
    .select("id");

  if (error) {
    console.error("Failed to delete water entry:", error);

    return NextResponse.json(
      { error: "Unable to delete water entry." },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Entry not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ deletedEntryId: data[0].id });
}