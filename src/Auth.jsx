import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import Icon from "./components/Icon";
import logoFull from "./assets/ethin-logo-full.png";
import Ring from "./components/Ring";

const AUTH_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];
function modeFromPath() {
  const p = location.pathname;
  if (p === "/signup") return "signup";
  if (p === "/forgot-password") return "forgot";
  if (p === "/reset-password") return "reset";
  return "login";
}
function initialMessage() {
  const verified = new URLSearchParams(location.search).get("verified");
  if (verified === "1") return { type: "info", text: "Email verified. You can sign in now." };
  if (verified === "0") return { type: "error", text: "This verification link is invalid or has expired. Sign up again with the same email to get a new link." };
  return null;
}

export default function Auth({ children, admin = false }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  // Sign-up is by invitation: the emailed link carries ?invite=<token>.
  const inviteToken = useRef(new URLSearchParams(location.search).get("invite") || "").current;
  const [invite, setInvite] = useState(null); // { employeeId, name, email, department } or { error }
  const [mode, setModeState] = useState(() => {
    const m = modeFromPath();
    return admin && m === "signup" ? "login" : m;
  });

  // An invitation link always opens the sign-up page, even if someone else is
  // already signed in on this browser.
  const inviteFlow = !admin && mode === "signup" && Boolean(inviteToken);

  function setMode(next, { keepMessage = false } = {}) {
    let path = { login: "/login", signup: "/signup", forgot: "/forgot-password", reset: "/reset-password" }[next];
    if (next === "signup" && inviteToken) path += "?invite=" + encodeURIComponent(inviteToken);
    history.pushState({}, "", path);
    setModeState(next);
    if (!keepMessage) setMessage(null);
  }

  useEffect(() => {
    api("/auth/me")
      .then((d) => {
        if (!admin || d.user.role === "admin") setUser(d.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    const expired = () => setUser(null);
    const onPop = () => setModeState(modeFromPath());
    window.addEventListener("session-expired", expired);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("popstate", onPop);
    };
  }, [admin]);

  // Look up the invitation so the form can show the details the admin entered.
  useEffect(() => {
    if (admin || mode !== "signup" || !inviteToken || invite) return;
    api("/auth/invite?token=" + encodeURIComponent(inviteToken))
      .then(setInvite)
      .catch((err) => setInvite({ error: err.message }));
  }, [admin, mode, inviteToken, invite]);

  // Once signed in, leave the /login or /signup URL so a refresh lands in the app.
  useEffect(() => {
    if (user && !inviteFlow && (mode === "login" || mode === "signup") && AUTH_PATHS.includes(location.pathname))
      history.replaceState({}, "", "/");
  }, [user, mode, inviteFlow]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (mode === "forgot") {
        const result = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify(data) });
        setMessage({ type: "info", text: result.message });
        return;
      }
      if (mode === "reset") {
        const token = new URLSearchParams(location.search).get("token");
        if (!token) throw new Error("This password reset link is invalid or expired. Request a new one.");
        if (data.password !== data.confirm) throw new Error("The two passwords do not match.");
        const result = await api("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password: data.password }),
        });
        setUser(null);
        setMode("login");
        setMessage({ type: "info", text: result.message });
        return;
      }
      if (mode === "signup" && !admin) {
        const result = await api("/auth/signup", { method: "POST", body: JSON.stringify({ ...data, inviteToken }) });
        // Sign out whoever was signed in before, so the new account signs in fresh.
        try { await api("/auth/logout", { method: "POST" }); } catch { /* already signed out */ }
        setUser(null);
        history.replaceState({}, "", "/login");
        setModeState("login");
        setMessage({ type: "info", text: result.message || "Check your inbox to verify your account." });
        return;
      }
      const result = await api("/auth/login", { method: "POST", body: JSON.stringify(data) });
      setUser(result.user);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // The server clears the cookie even for expired sessions; nothing else to do.
    }
    setUser(null);
    setModeState("login");
    setMessage(null);
    history.replaceState({}, "", "/login");
  }

  if (loading)
    return (
      <div className="auth-loading">
        <span><i className="spinner" /> Loading your workspace…</span>
      </div>
    );

  if (user && !inviteFlow && mode !== "forgot" && mode !== "reset") return children(user, setUser, logout);

  const isSignup = mode === "signup" && !admin;
  const title = isSignup
    ? "Create your account"
    : mode === "forgot"
      ? "Forgot your password?"
      : mode === "reset"
        ? "Set a new password"
        : "Welcome back";
  const subtitle = isSignup
    ? invite?.employeeId
      ? `You were invited as ${invite.employeeId}. Choose a password to finish.`
      : "Sign-up is by invitation from your administrator."
    : mode === "forgot"
      ? "Enter your email and we’ll send a secure reset link if the account exists."
      : mode === "reset"
        ? "Choose a new password for your account."
        : admin
          ? "Sign in with your administrator account."
          : "Sign in to raise and track your IT requests.";

  return (
    <main className="auth-layout" data-bg="lavender">
      <div className="auth-blobs" aria-hidden="true"><i /><i /><i /></div>
      <section className="auth-story">
        <div className="brand brand-full">
          <img className="brand-logo-full" src={logoFull} alt="Ethin" />
          <small>{admin ? "IT Administration" : "Employee Workspace"}</small>
        </div>
        <div>
          <p className="eyebrow">{admin ? "Service desk operations" : "Your IT team, one click away"}</p>
          <h1>{admin ? "Every request, triaged and tracked." : "Great work starts with reliable support."}</h1>
          <p>
            {admin
              ? "Review incoming tickets, route them to the right department and keep employees updated in real time."
              : "Raise a request, follow its progress and get updates from your IT team — all in one place."}
          </p>
          <div className="auth-orb">
            <Ring value={75} display="24/7" label={admin ? "Service desk" : "IT support"} />
          </div>
          <div className="auth-points">
            <div className="auth-point">
              <span className="stat-icon"><Icon name="inbox" /></span>
              <div><b>{admin ? "Live ticket inbox" : "Raise tickets in seconds"}</b><span>{admin ? "New submissions arrive instantly with notifications." : "Smart priority suggestions as you type."}</span></div>
            </div>
            <div className="auth-point">
              <span className="stat-icon green"><Icon name="checkCircle" /></span>
              <div><b>{admin ? "Department routing" : "Clear status updates"}</b><span>{admin ? "Filter and reassign tickets by team." : "See exactly where every request stands."}</span></div>
            </div>
          </div>
        </div>
        <small>Secure sign-in · Sessions are kept separate for each panel</small>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">{admin ? "Admin workspace" : "Employee workspace"}</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          <form onSubmit={submit} key={mode}>
            {isSignup && !inviteToken && (
              <p className="auth-message error" role="alert">
                <Icon name="alert" />
                <span>Sign-up is by invitation only. Use the link in the invitation email from your administrator.</span>
              </p>
            )}
            {isSignup && inviteToken && !invite && <p className="auth-message info" role="status"><span>Checking your invitation…</span></p>}
            {isSignup && invite?.error && (
              <p className="auth-message error" role="alert">
                <Icon name="alert" />
                <span>{invite.error}</span>
              </p>
            )}
            {isSignup && invite?.email && (
              <>
                <label className="field">
                  Full name
                  <input name="name" autoComplete="name" maxLength={100} required defaultValue={invite.name} placeholder="Jane Doe" />
                </label>
                <label className="field">
                  Company <span className="hint">(optional)</span>
                  <input name="company" maxLength={100} autoComplete="organization" placeholder="Company name" />
                </label>
                <label className="field">
                  Employee ID
                  <input value={invite.employeeId} readOnly />
                </label>
                <label className="field">
                  Department
                  <input value={invite.department} readOnly />
                </label>
              </>
            )}
            {mode !== "reset" && !(isSignup && !invite?.email) && (
              <label className="field">
                {mode === "login" ? (admin ? "Email address" : "Email or Employee ID") : "Email address"}
                <input
                  name="email"
                  type={mode === "login" && !admin ? "text" : "email"}
                  autoComplete="username"
                  required
                  maxLength={254}
                  readOnly={isSignup}
                  defaultValue={isSignup ? invite.email : undefined}
                  placeholder={mode === "login" && !admin ? "you@company.com or EMP1001" : "you@company.com"}
                />
              </label>
            )}
            {mode !== "forgot" && !(isSignup && !invite?.email) && (
              <label className="field">
                {mode === "reset" ? "New password" : "Password"}
                <input
                  name="password"
                  type="password"
                  minLength={isSignup || mode === "reset" ? 10 : 1}
                  maxLength={128}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  placeholder="••••••••••"
                />
                {(isSignup || mode === "reset") && <small>Use at least 10 characters.</small>}
              </label>
            )}
            {mode === "reset" && (
              <label className="field">
                Confirm new password
                <input name="confirm" type="password" minLength={10} maxLength={128} autoComplete="new-password" required placeholder="••••••••••" />
              </label>
            )}
            {mode === "login" && (
              <div className="auth-row">
                <button type="button" className="link-button" onClick={() => setMode("forgot")}>
                  Forgot password?
                </button>
              </div>
            )}
            {message && (
              <p className={"auth-message " + message.type} role={message.type === "error" ? "alert" : "status"}>
                <Icon name={message.type === "error" ? "alert" : "checkCircle"} />
                <span>{message.text}</span>
              </p>
            )}
            <button disabled={busy || (isSignup && !invite?.email)} className="btn btn-primary btn-block">
              {busy
                ? "Please wait…"
                : isSignup
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : mode === "reset"
                      ? "Reset password"
                      : "Sign in"}
              {!busy && <Icon name="arrowRight" />}
            </button>
          </form>
          {mode === "forgot" || mode === "reset" ? (
            <p className="switch">
              <button type="button" className="link-button" onClick={() => setMode("login")}>
                Back to sign in
              </button>
            </p>
          ) : !admin ? (
            <p className="switch">
              {isSignup ? "Already registered?" : "Have an invitation?"}{" "}
              <button type="button" className="link-button" onClick={() => setMode(isSignup ? "login" : "signup")}>
                {isSignup ? "Sign in" : "Create your account"}
              </button>
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
