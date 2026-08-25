import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Actual registered members, created automatically the first time
  // an invited person signs in with Clerk.
  members: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("event_head"), v.literal("core"), v.literal("teacher")),
    eventName: v.optional(v.string()), // only used for event_head role
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"]),

  // Pre-seeded allow-list: core team adds each person's email + role here
  // BEFORE that person signs in for the first time. Consumed and deleted
  // once the person actually signs in (turns into a `members` row).
  invites: defineTable({
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("event_head"), v.literal("core"), v.literal("teacher")),
    eventName: v.optional(v.string()),
  }).index("by_email", ["email"]),

  // Departments / events (e.g. "Battle of Bands", "Robotics") that event
  // heads get associated with. Core team manages this list from the app.
  events: defineTable({
    name: v.string(),
  }).index("by_name", ["name"]),

  // One row per member per calendar day.
  taskLogs: defineTable({
    memberId: v.id("members"),
    date: v.string(), // "YYYY-MM-DD"
    description: v.string(),
    updatedAt: v.number(),
  })
    .index("by_member", ["memberId"])
    .index("by_member_date", ["memberId", "date"]),
});
