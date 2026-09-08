import { withSupabase } from "npm:@supabase/server@^1";

type Member = { role: string; core_college?: string | null };

export default {
  fetch: withSupabase({ auth: "user" }, async (request, ctx) => {
    try {
      const { data: callerRows, error: callerError } = await ctx.supabase.rpc("get_current_member");
      const caller = callerRows?.[0] as Member | undefined;
      if (callerError || caller?.role !== "core" || caller.core_college !== "nhce") {
        return Response.json({ error: "Only NHCE Core can reset passwords" }, { status: 403 });
      }

      const body = await request.json();
      const memberId = typeof body.memberId === "string" ? body.memberId : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      if (!memberId || newPassword.length < 8 || newPassword.length > 128) {
        return Response.json({ error: "Use a temporary password between 8 and 128 characters" }, { status: 400 });
      }

      const { data: target, error: targetError } = await ctx.supabaseAdmin
        .from("members")
        .select("clerk_id")
        .eq("id", memberId)
        .single();
      if (targetError || !target?.clerk_id) {
        return Response.json({ error: "This member does not have a sign-in account yet" }, { status: 404 });
      }

      const { error: updateError } = await ctx.supabaseAdmin.auth.admin.updateUserById(
        target.clerk_id,
        { password: newPassword, email_confirm: true },
      );
      if (updateError) {
        console.error("Password reset failed", updateError.message);
        return Response.json({ error: "Password could not be reset" }, { status: 400 });
      }

      return Response.json({ ok: true });
    } catch (error) {
      console.error("Password reset request failed", error);
      return Response.json({ error: "Password could not be reset" }, { status: 500 });
    }
  }),
};
