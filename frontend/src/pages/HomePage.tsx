interface HomePageProps {
  onGetStarted: () => void;
}

const features = [
  {
    icon: "⚡",
    title: "Real-Time Sync",
    desc: "Every task move, comment, and update propagates instantly to all teammates via Socket.IO — no refresh needed.",
  },
  {
    icon: "🗂️",
    title: "Drag-&-Drop Kanban",
    desc: "Visual board with TO DO → IN PROGRESS → DONE columns. Drag cards to update status in one motion.",
  },
  {
    icon: "👥",
    title: "Workspace Collaboration",
    desc: "Invite teammates, assign roles (Admin / Member / Viewer), and control access per workspace.",
  },
  {
    icon: "🔐",
    title: "Secure Auth",
    desc: "JWT-based authentication with bcrypt hashing. New users register once; returning users log straight in.",
  },
  {
    icon: "💬",
    title: "Task Comments",
    desc: "Thread comments on any task, mention teammates, and keep all context in one place.",
  },
  {
    icon: "📊",
    title: "Activity Feed",
    desc: "Full audit trail of who moved, created, or updated what — across every board in your workspace.",
  },
];

const steps = [
  {
    num: "01",
    title: "Sign In or Register",
    desc: 'Enter your work email. First-timers set a name + password. Returning users jump straight to the password step. Click "Sign In" at the top right.',
  },
  {
    num: "02",
    title: "Join or Create a Workspace",
    desc: "Admins create workspaces and invite the team. Members request to join restricted workspaces. All activity is scoped to your workspace.",
  },
  {
    num: "03",
    title: "Open Your Board",
    desc: "Select a board from the workspace. Columns load instantly. Drag a task card to move it — changes sync to every open tab in real time.",
  },
  {
    num: "04",
    title: "Collaborate & Track",
    desc: "Add tasks, set priority, assign teammates, comment, and watch the activity feed. Admins can manage join requests from the lobby.",
  },
];

export default function HomePage({ onGetStarted }: HomePageProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base, #0d1117)",
        color: "var(--text-primary, #e6edf3)",
        fontFamily: "inherit",
        overflowX: "hidden",
      }}
    >
      {/* ── Top Nav ─────────────────────────────────────────────── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(13,17,23,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border, #21262d)",
          padding: "0 32px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: "linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 16,
              color: "#fff",
            }}
          >
            K
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.3px" }}>
            TechSters Kanban
          </span>
        </div>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <a href="#features" style={{ fontSize: 13.5, color: "var(--text-secondary, #8b949e)", textDecoration: "none" }}>
            Features
          </a>
          <a href="#how-to-use" style={{ fontSize: 13.5, color: "var(--text-secondary, #8b949e)", textDecoration: "none" }}>
            How to Use
          </a>
          <button
            onClick={onGetStarted}
            style={{
              background: "linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.1px",
            }}
          >
            Sign In →
          </button>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          textAlign: "center",
          padding: "90px 24px 80px",
          background:
            "radial-gradient(ellipse at 50% -10%, rgba(88,166,255,0.14) 0%, transparent 60%), radial-gradient(ellipse at 80% 60%, rgba(188,140,255,0.10) 0%, transparent 55%)",
        }}
      >
        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(88,166,255,0.1)",
            border: "1px solid rgba(88,166,255,0.3)",
            borderRadius: 100,
            padding: "5px 14px",
            fontSize: 12,
            color: "#58a6ff",
            fontWeight: 600,
            marginBottom: 28,
            letterSpacing: "0.5px",
          }}
        >
          ✦ AVISHKAR&apos;26 · Hackathon Edition
        </div>

        <h1
          style={{
            fontSize: "clamp(32px, 6vw, 58px)",
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: 20,
            letterSpacing: "-1.5px",
            background: "linear-gradient(135deg, #e6edf3 30%, #bc8cff 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Your team's real-time
          <br />
          Kanban workspace
        </h1>

        <p
          style={{
            fontSize: "clamp(14px, 2vw, 17px)",
            color: "var(--text-secondary, #8b949e)",
            maxWidth: 520,
            margin: "0 auto 40px",
            lineHeight: 1.65,
          }}
        >
          Collaborate on tasks, drag cards across columns, and watch every update propagate live to your whole team — all in one sleek board.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={onGetStarted}
            style={{
              background: "linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "13px 32px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 24px rgba(88,166,255,0.25)",
            }}
          >
            Get Started Free →
          </button>
          <a
            href="#how-to-use"
            style={{
              background: "transparent",
              color: "var(--text-secondary, #8b949e)",
              border: "1px solid var(--border, #21262d)",
              borderRadius: 10,
              padding: "13px 32px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            See how it works
          </a>
        </div>

        {/* Mini board preview */}
        <div
          style={{
            marginTop: 60,
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
            opacity: 0.75,
          }}
        >
          {["TO DO", "IN PROGRESS", "DONE"].map((col, ci) => (
            <div
              key={col}
              style={{
                width: 160,
                background: "var(--bg-surface, #161b22)",
                border: "1px solid var(--border, #21262d)",
                borderRadius: 10,
                padding: "12px",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", color: ["#58a6ff", "#f0883e", "#3fb950"][ci], marginBottom: 10 }}>
                {col}
              </div>
              {[1, 2].map((t) => (
                <div
                  key={t}
                  style={{
                    background: "var(--bg-base, #0d1117)",
                    border: "1px solid var(--border, #21262d)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    marginBottom: 6,
                    fontSize: 11,
                    color: "var(--text-secondary, #8b949e)",
                  }}
                >
                  {
                    [
                      ["Design schema", "JWT Auth"],
                      ["Build UI", "Socket.IO"],
                      ["Deploy app", "Seed DB"],
                    ][ci][t - 1]
                  }
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section id="features" style={{ padding: "72px 24px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "1.5px", color: "#58a6ff", textTransform: "uppercase", marginBottom: 10 }}>
            Everything you need
          </div>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, letterSpacing: "-0.8px", marginBottom: 10 }}>
            Built for real teams
          </h2>
          <p style={{ color: "var(--text-secondary, #8b949e)", fontSize: 14.5 }}>
            All the collaboration primitives you need, zero bloat.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                background: "var(--bg-surface, #161b22)",
                border: "1px solid var(--border, #21262d)",
                borderRadius: 12,
                padding: "24px",
                transition: "border-color 0.2s",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary, #8b949e)", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How To Use ──────────────────────────────────────────── */}
      <section
        id="how-to-use"
        style={{
          padding: "72px 24px",
          background: "var(--bg-surface, #161b22)",
          borderTop: "1px solid var(--border, #21262d)",
          borderBottom: "1px solid var(--border, #21262d)",
        }}
      >
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "1.5px", color: "#bc8cff", textTransform: "uppercase", marginBottom: 10 }}>
              Quick manual
            </div>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, letterSpacing: "-0.8px" }}>
              Up and running in 4 steps
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {steps.map((s, i) => (
              <div
                key={s.num}
                style={{
                  display: "flex",
                  gap: 24,
                  alignItems: "flex-start",
                  background: "var(--bg-base, #0d1117)",
                  border: "1px solid var(--border, #21262d)",
                  borderRadius: 12,
                  padding: "24px 28px",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: i % 2 === 0 ? "rgba(88,166,255,0.12)" : "rgba(188,140,255,0.12)",
                    border: `1px solid ${i % 2 === 0 ? "rgba(88,166,255,0.3)" : "rgba(188,140,255,0.3)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 800,
                    color: i % 2 === 0 ? "#58a6ff" : "#bc8cff",
                  }}
                >
                  {s.num}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 13.5, color: "var(--text-secondary, #8b949e)", lineHeight: 1.65 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo credentials callout ────────────────────────────── */}
      <section style={{ padding: "60px 24px", maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
        <div
          style={{
            background: "var(--bg-surface, #161b22)",
            border: "1px solid var(--border, #21262d)",
            borderRadius: 14,
            padding: "36px 32px",
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 12 }}>🎯</div>
          <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Try a demo account instantly</h3>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary, #8b949e)", marginBottom: 24, lineHeight: 1.6 }}>
            Three pre-seeded accounts let you explore every role without signing up.
            Password for all: <code style={{ background: "rgba(255,255,255,0.08)", borderRadius: 4, padding: "2px 7px", fontSize: 12.5 }}>password123</code>
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}>
            {[
              { label: "Admin", email: "alice@techsters.dev", color: "#58a6ff" },
              { label: "Member", email: "bob@techsters.dev", color: "#3fb950" },
              { label: "Viewer", email: "carol@techsters.dev", color: "#bc8cff" },
            ].map((d) => (
              <div
                key={d.label}
                style={{
                  background: "var(--bg-base, #0d1117)",
                  border: `1px solid ${d.color}44`,
                  borderRadius: 10,
                  padding: "12px 20px",
                  textAlign: "left",
                  minWidth: 170,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: d.color, letterSpacing: "0.5px", marginBottom: 4 }}>
                  {d.label}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary, #8b949e)" }}>{d.email}</div>
              </div>
            ))}
          </div>
          <button
            onClick={onGetStarted}
            style={{
              background: "linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 32px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Sign In & Explore →
          </button>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid var(--border, #21262d)",
          padding: "24px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 12.5,
          color: "var(--text-secondary, #8b949e)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              background: "linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 11,
              color: "#fff",
            }}
          >
            K
          </div>
          <span>TechSters Kanban · AVISHKAR&apos;26</span>
        </div>
        <div>Built with Express · Socket.IO · React · Prisma · Vercel</div>
      </footer>
    </div>
  );
}
