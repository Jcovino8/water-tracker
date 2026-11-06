import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sha256 } from "@/lib/nfc";
import { supabaseAdmin } from "@/lib/supabase-admin";

type LogBody = {
  token?: string;
  amountMl?: number;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as LogBody;
  const token = body.token?.trim();

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const tokenHash = sha256(token);

  const { data: tag, error: tagError } = await supabaseAdmin
    .from("nfc_tags")
    .select("id, user_id, default_amount_ml, is_active")
    .eq("public_tag_token_hash", tokenHash)
    .maybeSingle();

  if (tagError) {
    return NextResponse.json({ error: "Failed to resolve tag." }, { status: 500 });
  }

  if (!tag || !tag.is_active) {
    return NextResponse.json({ error: "Invalid or inactive chip." }, { status: 404 });
  }

  const amountMl = body.amountMl ?? tag.default_amount_ml;

  if (!Number.isInteger(amountMl) || amountMl <= 0 || amountMl > 5000) {
    return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  }

  const timeBucket = new Date().toISOString().slice(0, 16);
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(`${tag.id}:${timeBucket}:${amountMl}`)
    .digest("hex");

  const { data: existingEvent, error: existingEventError } = await supabaseAdmin
    .from("nfc_scan_events")
    .select("id, created_entry_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingEventError) {
    return NextResponse.json({ error: "Failed to verify scan event." }, { status: 500 });
  }

  if (existingEvent) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      createdEntryId: existingEvent.created_entry_id,
    });
  }

  const { data: entry, error: entryError } = await supabaseAdmin
    .from("water_entries")
    .insert({
      user_id: tag.user_id,
      amount_ml: amountMl,
      source: "nfc",
    })
    .select("id, user_id, amount_ml, created_at")
    .single();

  if (entryError) {
    return NextResponse.json({ error: "Failed to create water entry." }, { status: 500 });
  }

  const { error: scanInsertError } = await supabaseAdmin
    .from("nfc_scan_events")
    .insert({
      tag_id: tag.id,
      user_id: tag.user_id,
      idempotency_key: idempotencyKey,
      created_entry_id: entry.id,
      metadata: {},
    });

  if (scanInsertError) {
    return NextResponse.json({ error: "Failed to record scan event." }, { status: 500 });
  }

  const { error: tagUpdateError } = await supabaseAdmin
    .from("nfc_tags")
    .update({
      last_scanned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tag.id);

  if (tagUpdateError) {
    return NextResponse.json({ error: "Failed to update tag metadata." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    duplicate: false,
    entry,
  });
}