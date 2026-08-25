import { useEffect, useState } from "react";
import { SignedIn, SignedOut, SignIn, UserButton } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SARGAM</span>
          <span className="brand-sub">Daily Task Log</span>
        </div>
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
      </header>

      <SignedOut>
        <div className="auth-screen">
          <SignIn routing="hash" />
        </div>
      </SignedOut>

      <SignedIn>
        <Gate />
      </SignedIn>
    </div>
  );
}

function Gate() {
  const ensureMember = useMutation(api.members.ensureMember);
  const member = useQuery(api.members.currentMember);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    ensureMember()
      .catch(() => {})
      .finally(() => setAttempted(true));
  }, [ensureMember]);

  if (member === undefined || !attempted) {
    return <div className="center-msg">Loading…</div>;
  }

  if (member === null) {
    return (
      <div className="center-msg">
        <h2>Access not set up yet</h2>
        <p>
          Your email hasn't been added to the SARGAM invite list. Ask a core
          team member to add you (with the right role), then reload this
          page.
        </p>
      </div>
    );
  }

  return <Dashboard member={member} />;
}
