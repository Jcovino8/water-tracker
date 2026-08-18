"use client";

import { FormEvent, useEffect, useState } from "react";
import TopNav from "@/components/top-nav";
import { browserSupabase } from "@/lib/supabase-browser";

type SocialRequest = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  display_name?: string | null;
  username?: string | null;
};

type SocialFriend = {
  friend_user_id: string;
  display_name?: string | null;
  username?: string | null;
  created_at: string;
};

type SocialGroup = {
  id: string;
  name: string;
  description: string;
  join_code: string;
  owner_id: string;
  member_count: number;
};

type LeaderboardEntry = {
  user_id: string;
  display_name?: string | null;
  username?: string | null;
  total_oz: number;
};

type SocialSummary = {
  incomingRequests: SocialRequest[];
  outgoingRequests: SocialRequest[];
  friends: SocialFriend[];
  groups: SocialGroup[];
};

async function authedFetch(path: string, token: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

function displayName(name?: string | null, username?: string | null) {
  return name?.trim() || username?.trim() || "Hydration user";
}

export default function SocialPage() {
  const [accessToken, setAccessToken] = useState("");
  const [userId, setUserId] = useState("");
  const [summary, setSummary] = useState<SocialSummary>({
    incomingRequests: [],
    outgoingRequests: [],
    friends: [],
    groups: [],
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [friendUsername, setFriendUsername] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSendingFriendRequest, setIsSendingFriendRequest] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isJoiningGroup, setIsJoiningGroup] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadSocialData(token: string, options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;

    if (silent) {
      setIsRefreshing(true);
    }

    try {
      const [summaryResponse, leaderboardResponse] = await Promise.all([
        authedFetch("/api/social/summary", token),
        authedFetch("/api/social/leaderboard?days=7", token),
      ]);

      const summaryData = await summaryResponse.json();
      const leaderboardData = await leaderboardResponse.json();

      if (!summaryResponse.ok) {
        throw new Error(summaryData.error || "Failed to load social summary.");
      }

      if (!leaderboardResponse.ok) {
        throw new Error(leaderboardData.error || "Failed to load leaderboard.");
      }

      setSummary({
        incomingRequests: summaryData.incomingRequests ?? [],
        outgoingRequests: summaryData.outgoingRequests ?? [],
        friends: summaryData.friends ?? [],
        groups: summaryData.groups ?? [],
      });

      setLeaderboard(leaderboardData.leaderboard ?? []);
    } finally {
      if (silent) {
        setIsRefreshing(false);
      }
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
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
        setUserId(session.user.id);
        await loadSocialData(session.access_token);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load social data.",
        );
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void initialize();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!accessToken || !userId) return;

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    const refreshSocial = () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);

      refreshTimeout = setTimeout(() => {
        void loadSocialData(accessToken, { silent: true });
      }, 250);
    };

    const channel = browserSupabase
      .channel(`social-realtime:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
        },
        refreshSocial,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "social_groups",
        },
        refreshSocial,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "social_group_members",
        },
        refreshSocial,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "water_entries",
          filter: `user_id=eq.${userId}`,
        },
        refreshSocial,
      )
      .subscribe((status) => {
        console.log("Social realtime status:", status);
      });

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      void browserSupabase.removeChannel(channel);
    };
  }, [accessToken, userId]);

  async function sendFriendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    setIsSendingFriendRequest(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const response = await authedFetch("/api/social/friend-requests", accessToken, {
        method: "POST",
        body: JSON.stringify({ username: friendUsername }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send request.");
      }

      setFriendUsername("");
      setStatusMessage("Friend request sent.");
      await loadSocialData(accessToken, { silent: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not send friend request.",
      );
    } finally {
      setIsSendingFriendRequest(false);
    }
  }

  async function respondToRequest(requestId: string, action: "accept" | "decline") {
    if (!accessToken) return;

    setStatusMessage("");
    setErrorMessage("");

    try {
      const response = await authedFetch(
        `/api/social/friend-requests/${requestId}`,
        accessToken,
        {
          method: "PATCH",
          body: JSON.stringify({ action }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} request.`);
      }

      setStatusMessage(
        action === "accept" ? "Friend request accepted." : "Friend request declined.",
      );
      await loadSocialData(accessToken, { silent: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not update request.",
      );
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    setIsCreatingGroup(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const response = await authedFetch("/api/social/groups", accessToken, {
        method: "POST",
        body: JSON.stringify({
          name: groupName,
          description: groupDescription,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create group.");
      }

      setGroupName("");
      setGroupDescription("");
      setStatusMessage(`Group created. Join code: ${data.group.join_code}`);
      await loadSocialData(accessToken, { silent: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not create group.",
      );
    } finally {
      setIsCreatingGroup(false);
    }
  }

  async function joinGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    setIsJoiningGroup(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const response = await authedFetch("/api/social/groups/join", accessToken, {
        method: "POST",
        body: JSON.stringify({ joinCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to join group.");
      }

      setJoinCode("");
      setStatusMessage(`Joined ${data.group.name}.`);
      await loadSocialData(accessToken, { silent: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not join group.",
      );
    } finally {
      setIsJoiningGroup(false);
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0e13] px-5 text-slate-400">
        Loading social features…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0e13] px-4 py-6 text-slate-100 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <TopNav />

        <section className="rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                Social
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-white">
                Friends, groups, and leaderboard
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Add friends by username, accept requests, create groups, and compare 7-day hydration totals.
              </p>
            </div>

            <div className="rounded-md border border-white/10 px-3 py-2 text-right">
              <p className="text-xs text-slate-500">Live status</p>
              <p className="text-sm font-semibold text-white">
                {isRefreshing ? "Syncing…" : "Live"}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <form onSubmit={sendFriendRequest} className="rounded-2xl border border-white/10 bg-[#111720] p-5">
            <h2 className="text-lg font-semibold text-white">Add a friend</h2>
            <p className="mt-1 text-sm text-slate-400">Send a friend request using their username.</p>
            <div className="mt-4 flex gap-3">
              <input
                value={friendUsername}
                onChange={(event) => setFriendUsername(event.target.value)}
                placeholder="@username"
                className="flex-1 rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-3 text-white outline-none focus:border-cyan-300"
              />
              <button
                type="submit"
                disabled={isSendingFriendRequest}
                className="rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-[#071015] disabled:opacity-60"
              >
                {isSendingFriendRequest ? "Sending…" : "Send"}
              </button>
            </div>
          </form>

          <form onSubmit={joinGroup} className="rounded-2xl border border-white/10 bg-[#111720] p-5">
            <h2 className="text-lg font-semibold text-white">Join a group</h2>
            <p className="mt-1 text-sm text-slate-400">Enter a group join code.</p>
            <div className="mt-4 flex gap-3">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="ABC123"
                className="flex-1 rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-3 text-white outline-none focus:border-cyan-300"
              />
              <button
                type="submit"
                disabled={isJoiningGroup}
                className="rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-[#071015] disabled:opacity-60"
              >
                {isJoiningGroup ? "Joining…" : "Join"}
              </button>
            </div>
          </form>
        </section>

        <form onSubmit={createGroup} className="mt-5 rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Create a group</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Office Hydration Club"
              className="rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-3 text-white outline-none focus:border-cyan-300"
            />
            <input
              value={groupDescription}
              onChange={(event) => setGroupDescription(event.target.value)}
              placeholder="Optional group description"
              className="rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-3 text-white outline-none focus:border-cyan-300"
            />
            <button
              type="submit"
              disabled={isCreatingGroup}
              className="rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-[#071015] disabled:opacity-60"
            >
              {isCreatingGroup ? "Creating…" : "Create"}
            </button>
          </div>
        </form>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#111720] p-5">
            <h2 className="text-lg font-semibold text-white">Incoming requests</h2>
            <div className="mt-4 space-y-3">
              {summary.incomingRequests.length === 0 ? (
                <p className="text-sm text-slate-500">No incoming requests.</p>
              ) : (
                summary.incomingRequests.map((request) => (
                  <div key={request.id} className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                    <p className="font-medium text-white">
                      {displayName(request.display_name, request.username)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      @{request.username ?? "unknown"}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => respondToRequest(request.id, "accept")}
                        className="rounded-lg bg-cyan-300 px-3 py-2 text-sm font-bold text-[#071015]"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => respondToRequest(request.id, "decline")}
                        className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111720] p-5">
            <h2 className="text-lg font-semibold text-white">Pending sent</h2>
            <div className="mt-4 space-y-3">
              {summary.outgoingRequests.length === 0 ? (
                <p className="text-sm text-slate-500">No pending sent requests.</p>
              ) : (
                summary.outgoingRequests.map((request) => (
                  <div key={request.id} className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                    <p className="font-medium text-white">
                      {displayName(request.display_name, request.username)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      @{request.username ?? "unknown"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#111720] p-5">
            <h2 className="text-lg font-semibold text-white">Friends</h2>
            <div className="mt-4 space-y-3">
              {summary.friends.length === 0 ? (
                <p className="text-sm text-slate-500">No friends yet.</p>
              ) : (
                summary.friends.map((friend) => (
                  <div key={friend.friend_user_id} className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                    <p className="font-medium text-white">
                      {displayName(friend.display_name, friend.username)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      @{friend.username ?? "unknown"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111720] p-5">
            <h2 className="text-lg font-semibold text-white">Groups</h2>
            <div className="mt-4 space-y-3">
              {summary.groups.length === 0 ? (
                <p className="text-sm text-slate-500">You have not joined any groups yet.</p>
              ) : (
                summary.groups.map((group) => (
                  <div key={group.id} className="rounded-xl border border-white/10 bg-[#0b0e13] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{group.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{group.description || "No description"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Join code</p>
                        <p className="text-sm font-semibold text-cyan-300">{group.join_code}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-slate-400">{group.member_count} members</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Leaderboard
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Friends 7-day total
          </h2>

          <div className="mt-5 space-y-3">
            {leaderboard.length === 0 ? (
              <p className="text-sm text-slate-500">No leaderboard data yet.</p>
            ) : (
              leaderboard.map((entry, index) => (
                <div
                  key={entry.user_id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b0e13] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-300 text-sm font-bold text-[#071015]">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {displayName(entry.display_name, entry.username)}
                      </p>
                      <p className="text-sm text-slate-500">
                        @{entry.username ?? "unknown"}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-white">{entry.total_oz} oz</p>
                </div>
              ))
            )}
          </div>
        </section>

        {statusMessage && (
          <p className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-medium text-emerald-200">
            {statusMessage}
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