// @ts-nocheck
/**
 * Squad data layer — backed by the database so squads, invites, join requests,
 * chat and planning are shared across every player and device.
 */
import { supabase } from "@/integrations/supabase/client";

export type SquadRole = "captain" | "co_captain" | "player" | "sub";
export type RsvpStatus = "in" | "out" | "maybe";

export const SQUAD_COLORS = [
  { name: "Neon", value: "142 76% 45%" },
  { name: "Violet", value: "280 100% 60%" },
  { name: "Cyan", value: "190 95% 50%" },
  { name: "Amber", value: "38 95% 55%" },
  { name: "Rose", value: "347 90% 60%" },
];

export const ROLE_LABELS: Record<SquadRole, string> = {
  captain: "Captain",
  co_captain: "Co-captain",
  player: "Player",
  sub: "Sub",
};

export function isOfficer(role?: string | null) {
  return role === "captain" || role === "co_captain";
}

async function profileMap(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from("profiles")
    .select("user_id, username, avatar_url")
    .in("user_id", ids);
  const out: Record<string, { username: string; avatarUrl: string | null }> = {};
  for (const p of data ?? []) out[p.user_id] = { username: p.username ?? "Player", avatarUrl: p.avatar_url ?? null };
  return out;
}

function shapeSquad(row: any, profiles: Record<string, any>) {
  const members = (row.squad_members ?? []).map((m: any) => ({
    userId: m.user_id,
    role: (m.role ?? "player") as SquadRole,
    joinedAt: m.joined_at,
    username: profiles[m.user_id]?.username ?? "Player",
    avatarUrl: profiles[m.user_id]?.avatarUrl ?? null,
  }));
  members.sort((a: any, b: any) => {
    const order = { captain: 0, co_captain: 1, player: 2, sub: 3 } as any;
    return (order[a.role] ?? 9) - (order[b.role] ?? 9);
  });
  return {
    id: row.id,
    name: row.name,
    tag: row.tag ?? "",
    game: row.game ?? "other",
    bio: row.description ?? "",
    color: row.color ?? SQUAD_COLORS[0].value,
    ownerId: row.captain_id,
    isPublic: row.is_public !== false,
    maxMembers: row.max_members ?? 8,
    createdAt: row.created_at,
    members,
  };
}

const SQUAD_SELECT = "*, squad_members(user_id, role, joined_at)";

export async function fetchSquads(): Promise<any[]> {
  const { data, error } = await supabase
    .from("squads")
    .select(SQUAD_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const profiles = await profileMap((data ?? []).flatMap((s: any) => (s.squad_members ?? []).map((m: any) => m.user_id)));
  return (data ?? []).map((s: any) => shapeSquad(s, profiles));
}

export async function fetchSquad(squadId: string) {
  const { data, error } = await supabase.from("squads").select(SQUAD_SELECT).eq("id", squadId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const profiles = await profileMap((data.squad_members ?? []).map((m: any) => m.user_id));
  return shapeSquad(data, profiles);
}

export async function createSquad(input: {
  name: string;
  tag: string;
  game: string;
  bio?: string;
  color?: string;
  isPublic?: boolean;
  ownerId: string;
}) {
  const { data, error } = await supabase
    .from("squads")
    .insert({
      name: input.name.trim(),
      tag: input.tag.trim().toUpperCase().slice(0, 6),
      game: input.game,
      description: input.bio?.trim() || null,
      color: input.color ?? SQUAD_COLORS[0].value,
      is_public: input.isPublic ?? true,
      captain_id: input.ownerId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateSquad(squadId: string, patch: Record<string, any>) {
  const { error } = await supabase.from("squads").update(patch).eq("id", squadId);
  if (error) throw error;
}

export async function deleteSquad(squadId: string) {
  const { error } = await supabase.from("squads").delete().eq("id", squadId);
  if (error) throw error;
}

export async function setMemberRole(squadId: string, userId: string, role: SquadRole) {
  const { error } = await supabase
    .from("squad_members")
    .update({ role })
    .eq("squad_id", squadId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function removeMember(squadId: string, userId: string) {
  const { error } = await supabase
    .from("squad_members")
    .delete()
    .eq("squad_id", squadId)
    .eq("user_id", userId);
  if (error) throw error;
}

/* ---------------- invites ---------------- */

export async function fetchMyInvites(userId: string) {
  const { data, error } = await supabase
    .from("squad_invites")
    .select("*, squads(*)")
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const profiles = await profileMap((data ?? []).map((i: any) => i.inviter_id));
  return (data ?? []).map((i: any) => ({
    id: i.id,
    squadId: i.squad_id,
    role: (i.role ?? "player") as SquadRole,
    message: i.message,
    createdAt: i.created_at,
    fromUsername: profiles[i.inviter_id]?.username ?? "A captain",
    squad: {
      id: i.squads?.id,
      name: i.squads?.name ?? "Squad",
      tag: i.squads?.tag ?? "",
      game: i.squads?.game ?? "other",
      color: i.squads?.color ?? SQUAD_COLORS[0].value,
    },
  }));
}

export async function fetchSquadInvites(squadId: string) {
  const { data, error } = await supabase
    .from("squad_invites")
    .select("*")
    .eq("squad_id", squadId)
    .eq("status", "pending");
  if (error) return [];
  const profiles = await profileMap((data ?? []).map((i: any) => i.invitee_id));
  return (data ?? []).map((i: any) => ({
    id: i.id,
    role: i.role ?? "player",
    toUsername: profiles[i.invitee_id]?.username ?? "Player",
  }));
}

export async function invitePlayer(input: {
  squadId: string;
  inviterId: string;
  inviteeId: string;
  role: SquadRole;
  message?: string;
}) {
  const { data: existing } = await supabase
    .from("squad_members")
    .select("user_id")
    .eq("squad_id", input.squadId)
    .eq("user_id", input.inviteeId)
    .maybeSingle();
  if (existing) throw new Error("That player is already in this squad");

  const { error } = await supabase.from("squad_invites").insert({
    squad_id: input.squadId,
    inviter_id: input.inviterId,
    invitee_id: input.inviteeId,
    role: input.role,
    message: input.message ?? null,
    status: "pending",
  });
  if (error) {
    if (error.code === "23505") throw new Error("That player already has a pending invite");
    throw error;
  }
}

export async function respondToInvite(inviteId: string, accept: boolean) {
  const { error } = await supabase
    .from("squad_invites")
    .update({ status: accept ? "accepted" : "rejected" })
    .eq("id", inviteId);
  if (error) throw error;
}

export async function cancelInvite(inviteId: string) {
  const { error } = await supabase.from("squad_invites").delete().eq("id", inviteId);
  if (error) throw error;
}

/* ---------------- join requests ---------------- */

export async function fetchJoinRequests(squadId: string) {
  const { data, error } = await supabase
    .from("squad_join_requests")
    .select("*")
    .eq("squad_id", squadId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return [];
  const profiles = await profileMap((data ?? []).map((r: any) => r.user_id));
  return (data ?? []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    message: r.message,
    createdAt: r.created_at,
    username: profiles[r.user_id]?.username ?? "Player",
    avatarUrl: profiles[r.user_id]?.avatarUrl ?? null,
  }));
}

export async function fetchMyJoinRequests(userId: string) {
  const { data } = await supabase
    .from("squad_join_requests")
    .select("id, squad_id, status")
    .eq("user_id", userId);
  const out: Record<string, string> = {};
  for (const r of data ?? []) out[r.squad_id] = r.status;
  return out;
}

export async function requestToJoin(squadId: string, userId: string, message?: string) {
  const { error } = await supabase
    .from("squad_join_requests")
    .upsert(
      { squad_id: squadId, user_id: userId, message: message ?? null, status: "pending", responded_at: null },
      { onConflict: "squad_id,user_id" },
    );
  if (error) throw error;
}

export async function respondToJoinRequest(requestId: string, approve: boolean, officerId: string) {
  const { error } = await supabase
    .from("squad_join_requests")
    .update({ status: approve ? "approved" : "rejected", responded_by: officerId })
    .eq("id", requestId);
  if (error) throw error;
}

export async function cancelJoinRequest(squadId: string, userId: string) {
  await supabase.from("squad_join_requests").delete().eq("squad_id", squadId).eq("user_id", userId);
}

/* ---------------- chat ---------------- */

export async function fetchMessages(squadId: string) {
  const { data, error } = await supabase
    .from("squad_messages")
    .select("*")
    .eq("squad_id", squadId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    id: m.id,
    userId: m.is_system ? "system" : m.user_id,
    username: m.username,
    avatarUrl: m.avatar_url,
    text: m.content,
    pinned: m.pinned,
    createdAt: m.created_at,
  }));
}

export async function sendMessage(
  squadId: string,
  author: { userId: string; username: string; avatarUrl?: string | null },
  text: string,
) {
  const trimmed = text.trim().slice(0, 1000);
  if (!trimmed) return;
  const { error } = await supabase.from("squad_messages").insert({
    squad_id: squadId,
    user_id: author.userId,
    username: author.username,
    avatar_url: author.avatarUrl ?? null,
    content: trimmed,
  });
  if (error) throw error;
}

export async function togglePin(messageId: string, pinned: boolean) {
  const { error } = await supabase.from("squad_messages").update({ pinned }).eq("id", messageId);
  if (error) throw error;
}

/* ---------------- planning ---------------- */

export async function fetchEvents(squadId: string) {
  const { data, error } = await supabase
    .from("squad_events")
    .select("*")
    .eq("squad_id", squadId)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e: any) => ({
    id: e.id,
    title: e.title,
    game: e.game,
    startsAt: e.starts_at,
    notes: e.notes,
    type: e.type,
    createdBy: e.created_by,
    rsvps: e.rsvps ?? {},
  }));
}

export async function addEvent(
  squadId: string,
  input: { title: string; game: string; startsAt: string; notes?: string; type?: string; createdBy: string },
) {
  const { error } = await supabase.from("squad_events").insert({
    squad_id: squadId,
    title: input.title.trim(),
    game: input.game,
    starts_at: new Date(input.startsAt).toISOString(),
    notes: input.notes?.trim() || null,
    type: input.type ?? "tournament",
    created_by: input.createdBy,
    rsvps: { [input.createdBy]: "in" },
  });
  if (error) throw error;
}

export async function removeEvent(eventId: string) {
  const { error } = await supabase.from("squad_events").delete().eq("id", eventId);
  if (error) throw error;
}

export async function rsvp(eventId: string, userId: string, status: RsvpStatus) {
  const { data } = await supabase.from("squad_events").select("rsvps").eq("id", eventId).maybeSingle();
  const next = { ...(data?.rsvps ?? {}), [userId]: status };
  const { error } = await supabase.from("squad_events").update({ rsvps: next }).eq("id", eventId);
  if (error) throw error;
}
