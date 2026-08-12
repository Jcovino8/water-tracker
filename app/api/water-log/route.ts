import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type WaterLogRequest = {
  amountOz?: unknown;
  source?: unknown;
  bottleName?: unknown;
};

export async function POST(request: Request) {
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
  const source = body.source === "manual" ? "manual" : "nfc";
  const bottleName =
    typeof body.bottleName === "string" && body.bottleName.trim()
      ? body.bottleName.trim()
      : "Yeti";

  if (!Number.isFinite(amountOz) || amountOz <= 0 || amountOz > 256) {
    return NextResponse.json(
      { error: "amountOz must be a number between 0 and 256." },
      { status: 400 },
    );
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

  return NextResponse.json({ entry: data }, { status: 201 });
}


export async function GET() {
  const easternTimeZone = "America/New_York";

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: easternTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  function getEasternDateKey(timestamp: string) {
    const parts = dateFormatter.formatToParts(new Date(timestamp));

    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    return `${year}-${month}-${day}`;
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


export async function DELETE(request: Request) {
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