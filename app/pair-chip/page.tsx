"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/top-nav";
import { browserSupabase } from "@/lib/supabase-browser";

async function authorizedFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {},
) {
  return fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

type PairingSessionResponse = {
  pairingUrl: string;
  expiresAt?: string;
};

export default function PairChipPage() {
  const [accessToken, setAccessToken] = useState("");
  const [pairingUrl, setPairingUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [webNfcSupported, setWebNfcSupported] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const {
          data: { session },
          error,
        } = await browserSupabase.auth.getSession();

        if (error) throw error;

        if (!session) {
          window.location.replace("/login");
          return;
        }

        if (!isMounted) return;

        setAccessToken(session.access_token);
        setWebNfcSupported(typeof window !== "undefined" && "NDEFWriter" in window);

        const response = await authorizedFetch(
          "/api/nfc/pairing-session",
          session.access_token,
          { method: "POST" },
        );

        const data = (await response.json()) as PairingSessionResponse & {
          error?: string;
        };

        if (!response.ok) {
            if (!isMounted) return;
            setErrorMessage(data.error || "Unable to prepare bottle setup.");
            setIsLoading(false);
            return;
            }

        if (!isMounted) return;

        setPairingUrl(data.pairingUrl);
        setExpiresAt(data.expiresAt ?? "");
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not prepare bottle setup.",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, []);

  async function refreshPairingSession() {
    if (!accessToken) return;

    setIsPreparing(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await authorizedFetch(
        "/api/nfc/pairing-session",
        accessToken,
        { method: "POST" },
      );

      const data = (await response.json()) as PairingSessionResponse & {
        error?: string;
      };

      if (!response.ok) {
        setErrorMessage(data.error || "Unable to refresh setup session.");
        setMessage("");
        return;
      }

      setPairingUrl(data.pairingUrl);
      setExpiresAt(data.expiresAt ?? "");
      setMessage("Bottle setup session refreshed.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not refresh setup session.",
      );
    } finally {
      setIsPreparing(false);
    }
  }

  async function writeToChip() {
    if (!pairingUrl) return;

    if (typeof window === "undefined" || !("NDEFWriter" in window)) {
      setErrorMessage(
        "Web NFC is not supported on this device/browser. Use the fallback instructions below.",
      );
      return;
    }

    setIsWriting(true);
    setMessage("");
    setErrorMessage("");

    try {
      const writer = new (window as typeof window & {
        NDEFWriter: new () => {
          write: (data: { records: Array<{ recordType: string; data: string }> }) => Promise<void>;
        };
      }).NDEFWriter();

      await writer.write({
        records: [{ recordType: "url", data: pairingUrl }],
      });

      setMessage("Pairing info written. Now tap the chip once to finish linking it to your account.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not write to chip.",
      );
    } finally {
      setIsWriting(false);
    }
  }

  async function copyPairingUrl() {
    if (!pairingUrl) return;

    try {
      await navigator.clipboard.writeText(pairingUrl);
      setMessage("Pairing URL copied.");
      setErrorMessage("");
    } catch {
      setErrorMessage("Could not copy the pairing URL.");
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0e13] px-5 text-slate-400">
        Preparing bottle setup…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0e13] px-4 py-6 text-slate-100 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <TopNav />

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                Bottle setup
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-white">
                Pair a new bottle
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Link one NFC chip to your account so future taps record hydration instantly and only for you.
              </p>
            </div>

            <Link
              href="/profile"
              className="inline-flex rounded-lg border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              Back to profile
            </Link>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
              Setup flow
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Get this bottle ready
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Start with a fresh pairing session, then write that pairing link to the chip if your phone supports Web NFC.
            </p>

            <div className="mt-5 grid gap-3">
              <div className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Step 1
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  Generate a secure pairing session
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Your setup link is created server-side and tied to your signed-in account.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Step 2
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  Write the pairing info to the bottle chip
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  On supported Android devices, you can write it directly from this page.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Step 3
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  Tap once to finish pairing
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  After the chip is written, your next tap completes the link to your account.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-cyan-200/80">
                Pairing URL
              </p>
              <p className="mt-2 break-all text-sm text-slate-300">
                {pairingUrl || "No pairing URL available."}
              </p>
              {expiresAt && (
                <p className="mt-2 text-xs text-slate-500">
                  Expires at: {new Date(expiresAt).toLocaleString()}
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={writeToChip}
                disabled={!webNfcSupported || isWriting || !pairingUrl}
                className="rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-[#071015] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isWriting ? "Writing…" : "Write to chip"}
              </button>

              <button
                type="button"
                onClick={copyPairingUrl}
                disabled={!pairingUrl}
                className="rounded-lg border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Copy pairing URL
              </button>

              <button
                type="button"
                onClick={refreshPairingSession}
                disabled={isPreparing}
                className="rounded-lg border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPreparing ? "Refreshing…" : "Refresh session"}
              </button>
            </div>
          </div>

          <div className="grid gap-5">
            <div className="rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/80">
                Compatibility
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Device support
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Direct in-browser NFC setup works best on supported mobile browsers and devices.
              </p>

              <div className="mt-5 rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                <p className="text-sm text-slate-300">
                  Web NFC support on this device:{" "}
                  <span className="font-semibold text-white">
                    {webNfcSupported ? "Available" : "Not detected"}
                  </span>
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Fallback
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                If direct write is unavailable
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Copy the pairing URL and write it to the chip using an NFC writer app, then tap the chip once to finish pairing.
              </p>

              <div className="mt-5 rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                <ol className="space-y-3 text-sm text-slate-300">
                  <li>1. Copy the pairing URL from this page.</li>
                  <li>2. Use an NFC writer app to write that URL to the chip.</li>
                  <li>3. Tap the chip with your phone once after writing.</li>
                  <li>4. Return here or head back to Dashboard once the chip is linked.</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        {message && (
          <p className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-medium text-emerald-200">
            {message}
          </p>
        )}

        {errorMessage && (
          <p className="mt-5 rounded-lg border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm font-medium text-red-200">
            {errorMessage}
          </p>
        )}
      </div>
    </main>
  );
}