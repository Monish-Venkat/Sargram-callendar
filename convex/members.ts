import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

async function getCallerMember(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { identity: null, member: null };
  const member = await ctx.db
    .query("members")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  return { identity, member };
}

/**
 * Call this once, right after a person signs in with Clerk. If their email
 * was pre-added via `addInvite`, this turns the invite into a real member
 * row with the correct role. If it wasn't, it returns null and the UI shows
 * an "access not set up" screen.
 */
export const ensureMember = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (existing) return existing;

    const email = (identity.email ?? "").toLowerCase();
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!invite) return null;

    const memberId = await ctx.db.insert("members", {
      clerkId: identity.subject,
      email,
      name: invite.name || identity.name || email,
      role: invite.role,
      eventName: invite.eventName,
    });
    await ctx.db.delete(invite._id);
    return await ctx.db.get(memberId);
  },
});

export const currentMember = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await getCallerMember(ctx);
    return member;
  },
});

/**
 * Everyone whose calendar the caller is allowed to see.
 * - event_head: just themselves
 * - core / teacher: everyone except teachers (i.e. all event heads + core)
 */
export const listViewableMembers = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await getCallerMember(ctx);
    if (!member) return [];
    if (member.role === "event_head") return [member];
    const all = await ctx.db.query("members").collect();
    return all.filter((m) => m.role !== "teacher");
  },
});

/**
 * Core team uses this to pre-register each of the 21 event heads, the
 * other core members, and the teacher in-charge, BEFORE they sign in for
 * the first time. Safe to call again for the same email to update details.
 *
 * The very first invite (before any member exists at all) is allowed
 * through unauthenticated-caller-checked-later so the founding core member
 * can bootstrap the system from the Convex dashboard's function runner.
 */
export const addInvite = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("event_head"), v.literal("core"), v.literal("teacher")),
    eventName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const anyMembers = await ctx.db.query("members").take(1);
    if (anyMembers.length > 0) {
      const { member } = await getCallerMember(ctx);
      if (!member || member.role !== "core") {
        throw new Error("Only core team members can add people to the invite list");
      }
    }
    const email = args.email.toLowerCase();
    const existingInvite = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existingInvite) {
      await ctx.db.patch(existingInvite._id, { ...args, email });
      return;
    }
    await ctx.db.insert("invites", { ...args, email });
  },
});

export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await getCallerMember(ctx);
    if (!member || member.role !== "core") return [];
    return await ctx.db.query("invites").collect();
  },
});

export const deleteInvite = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    const { member } = await getCallerMember(ctx);
    if (!member || member.role !== "core") {
      throw new Error("Only core team members can remove invites");
    }
    await ctx.db.delete(inviteId);
  },
});

/** Full member list (with roles) — for the core team's management screen. */
export const listAllMembers = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await getCallerMember(ctx);
    if (!member || member.role !== "core") return [];
    return await ctx.db.query("members").collect();
  },
});

/** Core team adds/manages the list of departments/events event heads belong to. */
export const addEvent = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const { member } = await getCallerMember(ctx);
    if (!member || member.role !== "core") {
      throw new Error("Only core team members can add events/departments");
    }
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Event name can't be empty");
    const existing = await ctx.db
      .query("events")
      .withIndex("by_name", (q) => q.eq("name", trimmed))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("events", { name: trimmed });
  },
});

export const listEvents = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await getCallerMember(ctx);
    if (!member) return [];
    return await ctx.db.query("events").collect();
  },
});
