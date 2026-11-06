import { NextRequest, NextResponse } from "next/server";
import { generateOpaqueToken, sha256 } from "@/lib/nfc";
import { supabaseAdmin } from "@/lib/supabase-admin";

type CompletePairingBody = {
  pairingToken?: string;
  chipUid?: string | null;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as CompletePairingBody;

  const pairingToken = body.pairingToken?.trim();
  const chipUid = body.chipUid?.trim() || null;

  if (!pairingToken) {
    return NextResponse.json({ error: "Missing pairing token." }, { status: 400 });
  }

  const pairingTokenHash = sha256(pairingToken);

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("nfc_pairing_sessions")
    .select("id, user_id, label, default_amount_ml, expires_at, used_at, created_nfc_tag_id")
    .eq("pairing_token_hash", pairingTokenHash)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: "Failed to load pairing session." }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: "Invalid pairing session." }, { status: 404 });
  }

  if (session.used_at) {
    return NextResponse.json(
      { error: "This pairing session has already been used." },
      { status: 409 },
    );
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This pairing session has expired." },
      { status: 410 },
    );
  }

  if (chipUid) {
    const { data: existingChip, error: existingChipError } = await supabaseAdmin
      .from("nfc_tags")
      .select("id, user_id")
      .eq("chip_uid", chipUid)
      .maybeSingle();

    if (existingChipError) {
      return NextResponse.json(
        { error: "Failed to verify chip ownership." },
        { status: 500 },
      );
    }

    if (existingChip) {
      return NextResponse.json(
        { error: "This chip is already paired to an account." },
        { status: 409 },
      );
    }
  }

  const rawPublicTagToken = generateOpaqueToken(32);
  const publicTagTokenHash = sha256(rawPublicTagToken);

  const { data: createdTag, error: tagError } = await supabaseAdmin
    .from("nfc_tags")
    .insert({
      user_id: session.user_id,
      label: session.label,
      chip_uid: chipUid,
      public_tag_token_hash: publicTagTokenHash,
      default_amount_ml: session.default_amount_ml,
      is_active: true,
      paired_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, user_id, label, default_amount_ml, paired_at")
    .single();

  if (tagError) {
    return NextResponse.json({ error: "Failed to create NFC tag." }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("nfc_pairing_sessions")
    .update({
      used_at: new Date().toISOString(),
      created_nfc_tag_id: createdTag.id,
    })
    .eq("id", session.id)
    .is("used_at", null);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to finalize pairing session." },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_APP_URL" },
      { status: 500 },
    );
  }

  const logUrl = `${appUrl}/nfc/${rawPublicTagToken}`;

  return NextResponse.json({
    ok: true,
    tag: createdTag,
    logUrl,
    rawTagToken: rawPublicTagToken,
  });
}