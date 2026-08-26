import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { useEnsureMember, useCurrentMember } from "./hooks/useSupabase";
import Dashboard from "./pages/Dashboard";
import brandLogo from "./assets/sargam-brown.png";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoadingSession(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (loadingSession) return <div className="center-msg">Loading…</div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={brandLogo} alt="Sargam 2026 — a national level inter collegiate cultural fest" />
          <span className="brand-sub">Command centre</span>
        </div>
        {session && <button className="sign-out-btn" onClick={() => void supabase.auth.signOut()}>Sign out</button>}
      </header>
      {session ? <Gate /> : <AuthScreen />}
    </div>
  );
}

function Gate() {
  const ensureMember = useEnsureMember();
  const { data: member, isLoading } = useCurrentMember();
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!attempted) ensureMember.mutate(undefined, { onSettled: () => setAttempted(true) });
  }, [attempted, ensureMember]);

  if (!attempted || isLoading) return <div className="center-msg">Loading your workspace…</div>;
  if (!member) return <div className="center-msg"><h2>Access not set up yet</h2><p>Your signed-in email is not on the SARGAM invite list. Ask a Core Team member to add it, then sign out and back in.</p></div>;
  return <Dashboard member={member} />;
}

function AuthScreen() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const credentials = { email: email.trim().toLowerCase(), password };
    const result = mode === "signIn"
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.origin } });
    setSubmitting(false);
    if (result.error) return setMessage(result.error.message);
    if (mode === "signUp" && !result.data.session) setMessage("Check your email to confirm your account, then sign in.");
  };

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1>{mode === "signIn" ? "Welcome back" : "Create your account"}</h1>
        <p>Use the email address added to the SARGAM invite list.</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signIn" ? "current-password" : "new-password"} minLength={6} required /></label>
        {message && <div className="auth-message">{message}</div>}
        <button className="btn btn-primary" disabled={submitting}>{submitting ? "Please wait…" : mode === "signIn" ? "Sign in" : "Create account"}</button>
        <button type="button" className="auth-switch" onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setMessage(null); }}>
          {mode === "signIn" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
