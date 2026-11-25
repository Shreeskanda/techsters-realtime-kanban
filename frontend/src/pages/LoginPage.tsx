import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";

type Step = "email" | "register" | "login";
type AccountType = "ADMIN" | "MEMBER" | "USER";

export default function LoginPage() {
  const lastEmail = useAuthStore((s) => s.lastEmail);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep] = useState<Step>("email");
  const [accountType, setAccountType] = useState<AccountType>("MEMBER");
  const [email, setEmail] = useState(lastEmail || "");
  const [knownName, setKnownName] = useState<string | undefined>(undefined);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Returning user shortcut: verify email and jump to password login
  useEffect(() => {
    if (!lastEmail) return;
    let active = true;
    api.auth
      .checkEmail(lastEmail)
      .then((res) => {
        if (!active) return;
        if (res.exists) {
          setEmail(lastEmail);
          setKnownName(res.name);
          setStep("login");
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [lastEmail]);

  const checkAndAdvance = async (targetEmail: string) => {
    const trimmed = targetEmail.trim();
    if (!trimmed) return;
    setError("");
    setLoading(true);
    try {
      const res = await api.auth.checkEmail(trimmed);
      setKnownName(res.name);
      setPassword("");
      setStep(res.exists ? "login" : "register");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not verify email");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await checkAndAdvance(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (step === "register") {
        const systemRole = accountType === "ADMIN" ? "ADMIN" : "MEMBER";
        const { token, user } = await api.auth.register({
          name: name.trim(),
          email: email.trim(),
          password,
          systemRole,
        });
        setAuth(token, user);
      } else {
        const { token, user } = await api.auth.login({
          email: email.trim(),
          password,
        });
        setAuth(token, user);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const switchAccount = () => {
    setStep("email");
    setPassword("");
    setError("");
    setKnownName(undefined);
  };

  const roleSelector = (
    <div>
      <label className="field-label">Lobby / Account Type</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {(
          [
            { id: "ADMIN", label: "Admin" },
            { id: "MEMBER", label: "Member" },
            { id: "USER", label: "User" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setAccountType(opt.id)}
            className={`btn btn-sm ${accountType === opt.id ? "btn-primary" : "btn-secondary"}`}
            style={{ justifyContent: "center" }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 6 }}>
        {accountType === "ADMIN"
          ? "Admin Lobby: Manage organization workspaces, approve join requests & view analytics."
          : accountType === "MEMBER"
            ? "Member Lobby: Create projects, collaborate on Kanban boards & request team access."
            : "User Lobby: Join authorized projects, track tasks & submit feedback."}
      </div>
    </div>
  );

  return (
    <div
      className="auth-screen"
      style={{
        backgroundImage:
          "radial-gradient(circle at 18% 20%, rgba(88,166,255,0.08), transparent 45%), radial-gradient(circle at 82% 80%, rgba(188,140,255,0.07), transparent 45%)",
      }}
    >
      <div className="auth-card">
        <div className="auth-logo">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div className="logo-mark" style={{ width: 40, height: 40, fontSize: 17 }}>
              K
            </div>
            <div style={{ textAlign: "left" }}>
              <div className="logo-text" style={{ fontSize: 18 }}>
                TechSters ERP
              </div>
              <div className="logo-sub">Enterprise Resource Planning Platform</div>
            </div>
          </div>
        </div>

        {/* Mode Tabs: Login vs Create Account */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            padding: 4,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep(knownName ? "login" : "email");
            }}
            className={`btn btn-sm ${step !== "register" ? "btn-primary" : "btn-ghost"}`}
            style={{ justifyContent: "center" }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setPassword("");
              setStep("register");
            }}
            className={`btn btn-sm ${step === "register" ? "btn-primary" : "btn-ghost"}`}
            style={{ justifyContent: "center" }}
          >
            Create Account
          </button>
        </div>

        {/* Step 1: Identify Email */}
        {step === "email" && (
          <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {roleSelector}

            <div>
              <label className="field-label">Work Email</label>
              <input
                className="input"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "10px 16px" }}
            >
              {loading ? "Checking directory..." : "Continue →"}
            </button>
          </form>
        )}

        {/* Step 2A: Create Account (Admin / Member / User) */}
        {step === "register" && (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {roleSelector}

            <div>
              <label className="field-label">Full Name</label>
              <input
                className="input"
                placeholder="e.g. Jordan Patel"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
                minLength={2}
              />
            </div>

            <div>
              <label className="field-label">Work Email</label>
              <input
                className="input"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="field-label">Create Password (min. 6 characters)</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "10px 16px" }}
            >
              {loading ? "Creating account..." : `Create ${accountType === "ADMIN" ? "Admin" : accountType === "MEMBER" ? "Member" : "User"} Account →`}
            </button>
          </form>
        )}

        {/* Step 2B: Returning User – Password Only */}
        {step === "login" && (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {knownName ? `Welcome back, ${knownName}` : "Returning Account"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {email}
                </div>
              </div>
              <button type="button" onClick={switchAccount} className="btn btn-ghost btn-sm">
                Switch
              </button>
            </div>

            <div>
              <label className="field-label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "10px 16px" }}
            >
              {loading ? "Authenticating..." : "Sign In →"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
