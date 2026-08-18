import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getSupabase(accessToken: string) {
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function getUserFromRequest(request: NextRequest) {
  const authorizationHeader = request.headers.get("authorization");
  const accessToken = authorizationHeader?.replace("Bearer ", "");

  if (!accessToken) {
    return { error: "Missing access token.", status: 401 as const };
  }

  const supabase = getSupabase(accessToken);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: error?.message || "Unauthorized.",
      status: 401 as const,
    };
  }

  return { user, supabase };
}

function easternDateKey(value: string | Date) {
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

function profileLabel(profile?: ProfileRow | null) {
  return (
    profile?.display_name?.trim() ||
    profile?.username?.trim() ||
    "Hydration user"
  );
}

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
};

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  updated_at: string;
};

type SocialGroupRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type SocialGroupMemberRow = {
  group_id: string;
  user_id: string;
  role: "owner" | "member";
};

type SettingsRow = {
  id: string;
  daily_goal_oz: number;
};

type WaterEntryRow = {
  user_id: string;
  amount_oz: number;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await getUserFromRequest(request);

    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { user, supabase } = auth;

    const [
      incomingResult,
      outgoingResult,
      acceptedFriendshipsResult,
      currentMembershipsResult,
    ] = await Promise.all([
      supabase
        .from("friendships")
        .select(
          "id, requester_id, addressee_id, status, created_at, updated_at",
        )
        .eq("addressee_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("friendships")
        .select(
          "id, requester_id, addressee_id, status, created_at, updated_at",
        )
        .eq("requester_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("friendships")
        .select(
          "id, requester_id, addressee_id, status, created_at, updated_at",
        )
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .order("updated_at", { ascending: false }),
      supabase
        .from("social_group_members")
        .select("group_id, user_id, role")
        .eq("user_id", user.id),
    ]);

    if (incomingResult.error) {
      return NextResponse.json(
        { error: `Incoming requests query failed: ${incomingResult.error.message}` },
        { status: 500 },
      );
    }

    if (outgoingResult.error) {
      return NextResponse.json(
        { error: `Outgoing requests query failed: ${outgoingResult.error.message}` },
        { status: 500 },
      );
    }

    if (acceptedFriendshipsResult.error) {
      return NextResponse.json(
        { error: `Friendships query failed: ${acceptedFriendshipsResult.error.message}` },
        { status: 500 },
      );
    }

    if (currentMembershipsResult.error) {
      return NextResponse.json(
        { error: `Group membership query failed: ${currentMembershipsResult.error.message}` },
        { status: 500 },
      );
    }

    const incoming = (incomingResult.data ?? []) as FriendshipRow[];
    const outgoing = (outgoingResult.data ?? []) as FriendshipRow[];
    const acceptedFriendships =
      (acceptedFriendshipsResult.data ?? []) as FriendshipRow[];
    const currentMemberships =
      (currentMembershipsResult.data ?? []) as SocialGroupMemberRow[];

    const friendIds = Array.from(
      new Set(
        acceptedFriendships.map((friendship) =>
          friendship.requester_id === user.id
            ? friendship.addressee_id
            : friendship.requester_id,
        ),
      ),
    );

    const groupIds = Array.from(
      new Set(currentMemberships.map((membership) => membership.group_id)),
    );

    const socialUserIds = Array.from(
      new Set([
        user.id,
        ...friendIds,
        ...incoming.map((request) => request.requester_id),
        ...outgoing.map((request) => request.addressee_id),
      ]),
    );

    const [profilesResult, groupsResult] = await Promise.all([
      socialUserIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, display_name, username")
            .in("id", socialUserIds)
        : Promise.resolve({ data: [], error: null }),
      groupIds.length > 0
        ? supabase
            .from("social_groups")
            .select("id, owner_id, name, description, created_at")
            .in("id", groupIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) {
      return NextResponse.json(
        { error: `Profiles query failed: ${profilesResult.error.message}` },
        { status: 500 },
      );
    }

    if (groupsResult.error) {
      return NextResponse.json(
        { error: `Groups query failed: ${groupsResult.error.message}` },
        { status: 500 },
      );
    }

    const groups = (groupsResult.data ?? []) as SocialGroupRow[];

    const visibleGroupIds = groups.map((group) => group.id);

    const groupMembersResult =
      visibleGroupIds.length > 0
        ? await supabase
            .from("social_group_members")
            .select("group_id, user_id, role")
            .in("group_id", visibleGroupIds)
        : { data: [], error: null };

    if (groupMembersResult.error) {
      return NextResponse.json(
        { error: `Group members query failed: ${groupMembersResult.error.message}` },
        { status: 500 },
      );
    }

    const allGroupMembers =
      (groupMembersResult.data ?? []) as SocialGroupMemberRow[];

    const groupMemberUserIds = allGroupMembers.map((member) => member.user_id);

    const allProfileIds = Array.from(
      new Set([...socialUserIds, ...groupMemberUserIds]),
    );

    const finalProfilesResult =
      groupMemberUserIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, display_name, username")
            .in("id", allProfileIds)
        : { data: (profilesResult.data ?? []) as ProfileRow[], error: null };

    if (finalProfilesResult.error) {
      return NextResponse.json(
        { error: `Group profile query failed: ${finalProfilesResult.error.message}` },
        { status: 500 },
      );
    }

    const profiles = (finalProfilesResult.data ?? []) as ProfileRow[];
    const profilesById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );

    const leaderboardUserIds = Array.from(new Set([user.id, ...friendIds]));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [settingsResult, entriesResult] = await Promise.all([
      supabase
        .from("tracker_settings")
        .select("id, daily_goal_oz")
        .in("id", leaderboardUserIds),
      supabase
        .from("water_entries")
        .select("user_id, amount_oz, created_at")
        .in("user_id", leaderboardUserIds)
        .gte("created_at", sevenDaysAgo.toISOString()),
    ]);

    if (settingsResult.error) {
      return NextResponse.json(
        { error: `Settings query failed: ${settingsResult.error.message}` },
        { status: 500 },
      );
    }

    if (entriesResult.error) {
      return NextResponse.json(
        { error: `Leaderboard query failed: ${entriesResult.error.message}` },
        { status: 500 },
      );
    }

    const settings = (settingsResult.data ?? []) as SettingsRow[];
    const entries = (entriesResult.data ?? []) as WaterEntryRow[];

    const goalsByUserId = new Map(
      settings.map((setting) => [setting.id, Number(setting.daily_goal_oz)]),
    );

    const ouncesByUserByDate = new Map<string, Map<string, number>>();

    for (const entry of entries) {
      const dayKey = easternDateKey(entry.created_at);

      if (!ouncesByUserByDate.has(entry.user_id)) {
        ouncesByUserByDate.set(entry.user_id, new Map());
      }

      const userDayTotals = ouncesByUserByDate.get(entry.user_id)!;
      userDayTotals.set(
        dayKey,
        (userDayTotals.get(dayKey) ?? 0) + Number(entry.amount_oz),
      );
    }

    const sevenDayKeys = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      return easternDateKey(day);
    });

    const leaderboard = leaderboardUserIds
      .map((leaderboardUserId) => {
        const dayTotals = ouncesByUserByDate.get(leaderboardUserId) ?? new Map();
        const dailyGoalOz = goalsByUserId.get(leaderboardUserId) ?? null;

        const totalOz = sevenDayKeys.reduce(
          (sum, dayKey) => sum + (dayTotals.get(dayKey) ?? 0),
          0,
        );

        const goalDays =
          dailyGoalOz === null
            ? 0
            : sevenDayKeys.filter(
                (dayKey) => (dayTotals.get(dayKey) ?? 0) >= dailyGoalOz,
              ).length;

        const profile = profilesById.get(leaderboardUserId);

        return {
          userId: leaderboardUserId,
          label:
            leaderboardUserId === user.id
              ? "You"
              : profileLabel(profile),
          displayName: profile?.display_name ?? null,
          username: profile?.username ?? null,
          dailyGoalOz,
          totalOz,
          goalDays,
        };
      })
      .sort((a, b) => {
        if (b.totalOz !== a.totalOz) return b.totalOz - a.totalOz;
        if (b.goalDays !== a.goalDays) return b.goalDays - a.goalDays;
        return a.label.localeCompare(b.label);
      })
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    return NextResponse.json({
      incomingRequests: incoming.map((request) => {
        const sender = profilesById.get(request.requester_id);

        return {
          id: request.id,
          createdAt: request.created_at,
          sender: {
            id: request.requester_id,
            displayName: sender?.display_name ?? null,
            username: sender?.username ?? null,
            label: profileLabel(sender),
          },
        };
      }),
      outgoingRequests: outgoing.map((request) => {
        const receiver = profilesById.get(request.addressee_id);

        return {
          id: request.id,
          createdAt: request.created_at,
          receiver: {
            id: request.addressee_id,
            displayName: receiver?.display_name ?? null,
            username: receiver?.username ?? null,
            label: profileLabel(receiver),
          },
        };
      }),
      friends: acceptedFriendships.map((friendship) => {
        const friendId =
          friendship.requester_id === user.id
            ? friendship.addressee_id
            : friendship.requester_id;
        const profile = profilesById.get(friendId);

        return {
          id: friendship.id,
          friendId,
          displayName: profile?.display_name ?? null,
          username: profile?.username ?? null,
          label: profileLabel(profile),
          dailyGoalOz: goalsByUserId.get(friendId) ?? null,
          friendsSince: friendship.updated_at,
        };
      }),
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        ownerId: group.owner_id,
        createdAt: group.created_at,
        memberCount: allGroupMembers.filter(
          (membership) => membership.group_id === group.id,
        ).length,
        members: allGroupMembers
          .filter((membership) => membership.group_id === group.id)
          .map((membership) => {
            const profile = profilesById.get(membership.user_id);

            return {
              userId: membership.user_id,
              role: membership.role,
              displayName: profile?.display_name ?? null,
              username: profile?.username ?? null,
              label:
                membership.user_id === user.id
                  ? "You"
                  : profileLabel(profile),
            };
          }),
      })),
      leaderboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown Social API error.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getUserFromRequest(request);

    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { user, supabase } = auth;
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "send_friend_request") {
      const username = String(body.username ?? "").trim().toLowerCase();

      if (!username) {
        return NextResponse.json(
          { error: "Username is required." },
          { status: 400 },
        );
      }

      const { data: targetProfile, error: targetError } = await supabase
        .from("profiles")
        .select("id, display_name, username")
        .eq("username", username)
        .maybeSingle();

      if (targetError) {
        return NextResponse.json(
          { error: `User lookup failed: ${targetError.message}` },
          { status: 500 },
        );
      }

      if (!targetProfile) {
        return NextResponse.json(
          { error: "No user found with that username." },
          { status: 404 },
        );
      }

      if (targetProfile.id === user.id) {
        return NextResponse.json(
          { error: "You cannot send a friend request to yourself." },
          { status: 400 },
        );
      }

      const { data: existingFriendship, error: existingError } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${targetProfile.id}),and(requester_id.eq.${targetProfile.id},addressee_id.eq.${user.id})`,
        )
        .in("status", ["pending", "accepted"])
        .maybeSingle();

      if (existingError) {
        return NextResponse.json(
          { error: `Friendship check failed: ${existingError.message}` },
          { status: 500 },
        );
      }

      if (existingFriendship) {
        return NextResponse.json(
          {
            error:
              existingFriendship.status === "accepted"
                ? "You are already friends with this user."
                : "A friend request already exists between you two.",
          },
          { status: 400 },
        );
      }

      const { error: insertError } = await supabase.from("friendships").insert({
        requester_id: user.id,
        addressee_id: targetProfile.id,
        status: "pending",
      });

      if (insertError) {
        return NextResponse.json(
          { error: `Could not send request: ${insertError.message}` },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === "respond_to_friend_request") {
      const requestId = String(body.requestId ?? "");
      const response = String(body.response ?? "");

      if (!requestId || !["accepted", "declined"].includes(response)) {
        return NextResponse.json(
          { error: "Invalid friend request response." },
          { status: 400 },
        );
      }

      const { data: requestRow, error: requestError } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status")
        .eq("id", requestId)
        .maybeSingle();

      if (requestError) {
        return NextResponse.json(
          { error: `Request lookup failed: ${requestError.message}` },
          { status: 500 },
        );
      }

      if (!requestRow) {
        return NextResponse.json(
          { error: "Friend request not found." },
          { status: 404 },
        );
      }

      if (requestRow.addressee_id !== user.id) {
        return NextResponse.json(
          { error: "Only the request recipient can respond." },
          { status: 403 },
        );
      }

      if (requestRow.status !== "pending") {
        return NextResponse.json(
          { error: "This request has already been handled." },
          { status: 400 },
        );
      }

      const { error: updateError } = await supabase
        .from("friendships")
        .update({ status: response })
        .eq("id", requestId);

      if (updateError) {
        return NextResponse.json(
          { error: `Could not update request: ${updateError.message}` },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === "create_group") {
      const name = String(body.name ?? "").trim();
      const description = String(body.description ?? "").trim();

      if (!name || name.length > 80) {
        return NextResponse.json(
          { error: "Group name must be between 1 and 80 characters." },
          { status: 400 },
        );
      }

      if (description.length > 280) {
        return NextResponse.json(
          { error: "Group description must be 280 characters or fewer." },
          { status: 400 },
        );
      }

      const { data: group, error: groupError } = await supabase
        .from("social_groups")
        .insert({
          owner_id: user.id,
          name,
          description: description || null,
        })
        .select("id")
        .single();

      if (groupError || !group) {
        return NextResponse.json(
          { error: `Could not create group: ${groupError?.message ?? "Unknown error"}` },
          { status: 500 },
        );
      }

      const { error: membershipError } = await supabase
        .from("social_group_members")
        .insert({
          group_id: group.id,
          user_id: user.id,
          role: "owner",
        });

      if (membershipError) {
        return NextResponse.json(
          { error: `Group created, but owner membership failed: ${membershipError.message}` },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, groupId: group.id });
    }

    if (action === "add_group_member") {
      const groupId = String(body.groupId ?? "");
      const username = String(body.username ?? "").trim().toLowerCase();

      if (!groupId || !username) {
        return NextResponse.json(
          { error: "Group and username are required." },
          { status: 400 },
        );
      }

      const [{ data: group, error: groupError }, { data: target, error: targetError }] =
        await Promise.all([
          supabase
            .from("social_groups")
            .select("id, owner_id")
            .eq("id", groupId)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("id, username")
            .eq("username", username)
            .maybeSingle(),
        ]);

      if (groupError) {
        return NextResponse.json(
          { error: `Group lookup failed: ${groupError.message}` },
          { status: 500 },
        );
      }

      if (!group) {
        return NextResponse.json({ error: "Group not found." }, { status: 404 });
      }

      if (group.owner_id !== user.id) {
        return NextResponse.json(
          { error: "Only the group owner can add members." },
          { status: 403 },
        );
      }

      if (targetError) {
        return NextResponse.json(
          { error: `User lookup failed: ${targetError.message}` },
          { status: 500 },
        );
      }

      if (!target) {
        return NextResponse.json(
          { error: "No user found with that username." },
          { status: 404 },
        );
      }

      if (target.id !== user.id) {
        const { data: friendship, error: friendshipError } = await supabase
          .from("friendships")
          .select("id")
          .eq("status", "accepted")
          .or(
            `and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`,
          )
          .maybeSingle();

        if (friendshipError) {
          return NextResponse.json(
            { error: `Friendship check failed: ${friendshipError.message}` },
            { status: 500 },
          );
        }

        if (!friendship) {
          return NextResponse.json(
            { error: "Only accepted friends can be added to a group." },
            { status: 400 },
          );
        }
      }

      const { error: insertError } = await supabase
        .from("social_group_members")
        .insert({
          group_id: groupId,
          user_id: target.id,
          role: "member",
        });

      if (insertError) {
        return NextResponse.json(
          { error: `Could not add group member: ${insertError.message}` },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown Social API error.",
      },
      { status: 500 },
    );
  }
}