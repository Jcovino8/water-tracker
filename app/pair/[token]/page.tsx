"use client";

import { useEffect, useState } from "react";

type PairState =
  | { status: "loading"; message: string }
  | { status: "success"; message: string; logUrl?: string }
  | { status: "error"; message: string };

export default function PairTokenPage({
  params,
}: {
  params: { token: string };
}) {
  const [state, setState] = useState<PairState>({
    status: "loading",
    message: "Pairing your chip...",
  });

  useEffect(() => {
    let isMounted = true;

    async function completePairing() {
      try {
        const response = await fetch("/api/nfc/complete-pairing", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pairingToken: params.token,
          }),
        });

        const payload = await response.json();

        if (!isMounted) return;

        if (!response.ok) {
          setState({
            status: "error",
            message: payload.error ?? "Failed to pair chip.",
          });
          return;
        }

        setState({
          status: "success",
          message: "Chip paired successfully.",
          logUrl: payload.logUrl,
        });
      } catch {
        if (!isMounted) return;

        setState({
          status: "error",
          message: "Network error while pairing chip.",
        });
      }
    }

    void completePairing();

    return () => {
      isMounted = false;
    };
  }, [params.token]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold">Pair chip</h1>

        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {state.message}
        </p>

        {state.status === "success" && state.logUrl && (
          <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-xs break-all dark:bg-zinc-900">
            Permanent log URL:
            <div className="mt-2">{state.logUrl}</div>
          </div>
        )}

        {state.status === "error" && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            Please go back to the app and create a new pairing session.
          </p>
        )}
      </div>
    </main>
  );
}