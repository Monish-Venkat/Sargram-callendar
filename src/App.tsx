import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { useEnsureMember } from "./hooks/useSupabase";
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

  useEffect(() => {
    if (ensureMember.status === "idle") ensureMember.mutate();
  }, [ensureMember]);

  if (ensureMember.isPending || ensureMember.status === "idle") return <div className="center-msg">Loading your workspace…</div>;
  const member = ensureMember.data;
  if (!member) return <div className="center-msg"><h2>Access not set up yet</h2><p>{ensureMember.error ? `Account setup failed: ${ensureMember.error.message}` : "Your signed-in email is not on the SARGAM invite list. Ask a Core Team member to add it, then refresh this page."}</p></div>;
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
    if (mode === "signUp") {
      const { data: signupStatus, error: eligibilityError } = await supabase.rpc("get_password_signup_status", { p_email: credentials.email });
      if (eligibilityError || signupStatus !== "eligible") {
        setSubmitting(false);
        if (signupStatus === "account_exists") setMessage("An account for this email already exists. Sign in with its password. If it is forgotten, ask the Supabase administrator to reset it.");
        else setMessage("This exact email is not on the approved member list. Ask NHCE Core to check the spelling in Manage Team, then try again.");
        return;
      }
    }
    const result = mode === "signIn"
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp(credentials);
    setSubmitting(false);
    if (result.error) {
      if (result.error.message === "Invalid login credentials") return setMessage("Email or password is incorrect. If you have not created a password yet, choose Create password.");
      if (result.error.message === "User already registered") return setMessage("An account already exists for this email. Sign in with its password.");
      return setMessage(result.error.message);
    }
    if (mode === "signUp" && !result.data.session) setMessage("Email confirmation is still enabled. Ask an administrator to disable Confirm email in Supabase Authentication → Email.");
  };

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1>{mode === "signIn" ? "Welcome back" : "Create your password"}</h1>
        <p>Use the approved SARGAM email address. No confirmation email is required.</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signIn" ? "current-password" : "new-password"} minLength={6} required /></label>
        {message && <div className="auth-message">{message}</div>}
        <button className="btn btn-primary" disabled={submitting}>{submitting ? "Please wait…" : mode === "signIn" ? "Sign in" : "Create password"}</button>
        <button type="button" className="auth-switch" onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setMessage(null); }}>
          {mode === "signIn" ? "First time here? Create password" : "Already have a password? Sign in"}
        </button>
      </form>
    </main>
  );
}
