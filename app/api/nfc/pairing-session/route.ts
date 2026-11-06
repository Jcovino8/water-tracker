import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { generateOpaqueToken, sha256 } from "@/lib/nfc";
import { supabaseAdmin } from "@/lib/supabase-admin";

type CreatePairingBody = {
  label?: string;
  defaultAmountMl?: number;
};

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;

    const user = await getAuthUser(accessToken);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as CreatePairingBody;

    const label = (body.label ?? "Water bottle chip").trim();
    const defaultAmountMl = body.defaultAmountMl ?? 500;

    if (!Number.isInteger(defaultAmountMl) || defaultAmountMl <= 0 || defaultAmountMl > 5000) {
      return NextResponse.json({ error: "Invalid default amount." }, { status: 400 });
    }

    const rawPairingToken = generateOpaqueToken(32);
    const pairingTokenHash = sha256(rawPairingToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("nfc_pairing_sessions")
      .insert({
        user_id: user.id,
        pairing_token_hash: pairingTokenHash,
        label,
        default_amount_ml: defaultAmountMl,
        expires_at: expiresAt,
      })
      .select("id, label, default_amount_ml, expires_at, created_at")
      .single();

    if (error) {
      console.error("pairing-session insert error:", error);

      return NextResponse.json(
        {
          error: error.message,
          details: error,
        },
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

    const pairingUrl = `${appUrl}/pair/${rawPairingToken}`;

    return NextResponse.json({
      session: data,
      pairingToken: rawPairingToken,
      pairingUrl,
      expiresAt,
    });
  } catch (error) {
    console.error("pairing-session route crash:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}