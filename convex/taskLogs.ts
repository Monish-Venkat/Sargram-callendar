import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

async function getCaller(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const member = await ctx.db
    .query("members")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!member) throw new Error("Not registered — ask a core team member to invite you");
  return member;
}

function canView(caller: { _id: Id<"members">; role: string }, targetId: Id<"members">) {
  if (caller._id === targetId) return true;
  // Core sees everyone; teacher sees everyone. Event heads only see themselves.
  return caller.role === "core" || caller.role === "teacher";
}

export const upsertLog = mutation({
  args: { date: v.string(), description: v.string() },
  handler: async (ctx, { date, description }) => {
    const caller = await getCaller(ctx);
    if (caller.role === "teacher") {
      throw new Error("Teacher in-charge accounts are read-only");
    }
    const existing = await ctx.db
      .query("taskLogs")
      .withIndex("by_member_date", (q) => q.eq("memberId", caller._id).eq("date", date))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { description, updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("taskLogs", {
      memberId: caller._id,
      date,
      description,
      updatedAt: Date.now(),
    });
  },
});

export const deleteLog = mutation({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const caller = await getCaller(ctx);
    const existing = await ctx.db
      .query("taskLogs")
      .withIndex("by_member_date", (q) => q.eq("memberId", caller._id).eq("date", date))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const logsForMember = query({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const caller = await getCaller(ctx);
    if (!canView(caller, memberId)) {
      throw new Error("You're not authorized to view this member's log");
    }
    return await ctx.db
      .query("taskLogs")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .collect();
  },
});
