interface HomePageProps {
  onGetStarted: () => void;
}

const features = [
  {
    icon: "⚡",
    title: "Real-Time Collaboration",
    desc: "Every task move, comment, and update propagates instantly to all teammates via Socket.IO. Your whole team works in sync — zero refresh.",
  },
  {
    icon: "🗂️",
    title: "Kanban Project Boards",
    desc: "Visual boards with drag-and-drop columns. Track backlogs, sprints, and deliverables across every team and department.",
  },
  {
    icon: "🏢",
    title: "Multi-Workspace Org",
    desc: "Create unlimited workspaces per department or project. Invite members, assign roles (Admin / Member / Viewer), and control access granularly.",
  },
  {
    icon: "🔐",
    title: "Enterprise Security",
    desc: "JWT-based auth, bcrypt password hashing, role-based access control. Every action is scoped to the authenticated user's permissions.",
  },
  {
    icon: "💬",
    title: "Threaded Task Comments",
    desc: "Keep all discussion in context — thread comments on any task, so nothing gets lost in chat.",
  },
  {
    icon: "📊",
    title: "Full Activity Audit",
    desc: "Every action is logged — who created, moved, or updated what, and when. Full transparency across all boards and workspaces.",
  },
  {
    icon: "🎯",
    title: "Priority & Assignment",
    desc: "Set task priority (High / Medium / Low), assign to any team member, attach labels, and track progress with due dates.",
  },
  {
    icon: "🔔",
    title: "Join Request Workflow",
    desc: "Members can request access to restricted workspaces. Admins approve or deny from the admin lobby — full governance built in.",
  },
];

const steps = [
  {
    num: "01",
    title: "Create Your Account",
    desc: "Enter your work email and set a name and password. No invite needed — register instantly and start building your organization.",
  },
  {
    num: "02",
    title: "Create a Workspace",
    desc: "Workspaces are your departments, teams, or projects. Create one, name it, and invite your team. Members get role-based access.",
  },
  {
    num: "03",
    title: "Build Your Boards",
    desc: "Each workspace can have multiple Kanban boards. Add columns, create tasks, assign priorities, and start tracking work.",
  },
  {
    num: "04",
    title: "Collaborate in Real Time",
    desc: "Everyone on the board sees updates live. Comment on tasks, drag cards, approve join requests — the full ERP workflow, together.",
  },
];

const stats = [
  { value: "Real-Time", label: "WebSocket sync via Socket.IO" },
  { value: "RBAC", label: "Role-based access control" },
  { value: "Unlimited", label: "Workspaces & boards" },
  { value: "Open", label: "Free to register & use" },
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
          background: "rgba(13,17,23,0.90)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--border, #21262d)",
          padding: "0 40px",
          height: 62,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Diamond icon — matches the app navbar */}
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="hp-logo-grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#58a6ff"/>
                <stop offset="100%" stopColor="#bc8cff"/>
              </linearGradient>
            </defs>
            <rect width="36" height="36" rx="9" fill="url(#hp-logo-grad)"/>
            {/* diamond / kite shape */}
            <polygon points="18,6 30,18 18,30 6,18" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2"/>
            <polygon points="18,10 26,18 18,26 10,18" fill="rgba(255,255,255,0.18)"/>
            <circle cx="18" cy="18" r="3.5" fill="#fff"/>
          </svg>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.4px", lineHeight: 1.1 }}>
              <span style={{ color: "var(--text-primary,#e6edf3)" }}>Tech</span>
              <span style={{
                background: "linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>Sters</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-secondary,#8b949e)", letterSpacing: "0.4px", marginTop: 1 }}>
              Collaborative Kanban
            </div>
          </div>
        </div>

        {/* Nav links + CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <a href="#features" style={{ fontSize: 13.5, color: "var(--text-secondary, #8b949e)", textDecoration: "none" }}>
            Features
          </a>
          <a href="#how-it-works" style={{ fontSize: 13.5, color: "var(--text-secondary, #8b949e)", textDecoration: "none" }}>
            How It Works
          </a>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onGetStarted}
              style={{
                background: "transparent",
                color: "var(--text-secondary,#8b949e)",
                border: "1px solid var(--border,#21262d)",
                borderRadius: 8,
                padding: "7px 18px",
                fontSize: 13.5,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Sign In
            </button>
            <button
              onClick={onGetStarted}
              style={{
                background: "linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "7px 20px",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 2px 12px rgba(88,166,255,0.25)",
              }}
            >
              Create Workspace →
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          textAlign: "center",
          padding: "100px 24px 90px",
          background:
            "radial-gradient(ellipse at 30% -5%, rgba(88,166,255,0.13) 0%, transparent 55%), radial-gradient(ellipse at 75% 70%, rgba(188,140,255,0.10) 0%, transparent 55%)",
        }}
      >
        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            background: "rgba(63,185,80,0.10)",
            border: "1px solid rgba(63,185,80,0.3)",
            borderRadius: 100,
            padding: "5px 16px",
            fontSize: 12,
            color: "#3fb950",
            fontWeight: 600,
            marginBottom: 30,
            letterSpacing: "0.4px",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3fb950", display: "inline-block" }} />
          Built for teams that move fast
        </div>

        <h1
          style={{
            fontSize: "clamp(34px, 6vw, 62px)",
            fontWeight: 800,
            lineHeight: 1.08,
            marginBottom: 22,
            letterSpacing: "-2px",
            background: "linear-gradient(135deg, #e6edf3 20%, #bc8cff 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Real-time collaboration,
          <br />
          without the complexity
        </h1>

        <p
          style={{
            fontSize: "clamp(14.5px, 2vw, 18px)",
            color: "var(--text-secondary, #8b949e)",
            maxWidth: 560,
            margin: "0 auto 44px",
            lineHeight: 1.7,
          }}
        >
          Create your account, build workspaces, manage projects with real-time Kanban boards, and collaborate with your entire organization — all in one platform.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={onGetStarted}
            style={{
              background: "linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "14px 36px",
              fontSize: 15.5,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 28px rgba(88,166,255,0.28)",
              letterSpacing: "-0.2px",
            }}
          >
            Start for Free →
          </button>
          <a
            href="#how-it-works"
            style={{
              background: "transparent",
              color: "var(--text-primary,#e6edf3)",
              border: "1px solid var(--border,#21262d)",
              borderRadius: 10,
              padding: "14px 36px",
              fontSize: 15.5,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            See how it works ↓
          </a>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: 0,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 64,
            borderTop: "1px solid var(--border,#21262d)",
            paddingTop: 36,
            maxWidth: 760,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {stats.map((s, i) => (
            <div
              key={s.value}
              style={{
                flex: "1 1 150px",
                padding: "0 24px",
                borderRight: i < stats.length - 1 ? "1px solid var(--border,#21262d)" : "none",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: "#58a6ff", letterSpacing: "-0.5px", marginBottom: 4 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary,#8b949e)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section id="features" style={{ padding: "80px 24px", maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "2px", color: "#58a6ff", textTransform: "uppercase", marginBottom: 12 }}>
            Platform Capabilities
          </div>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 38px)", fontWeight: 800, letterSpacing: "-1px", marginBottom: 12 }}>
            Everything your org needs
          </h2>
          <p style={{ color: "var(--text-secondary, #8b949e)", fontSize: 15, maxWidth: 480, margin: "0 auto" }}>
            From project tracking to org-wide governance — built as a full ERP, not a toy tool.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 16,
          }}
        >
          {features.map((f, i) => (
            <div
              key={f.title}
              style={{
                background: "var(--bg-surface, #161b22)",
                border: "1px solid var(--border, #21262d)",
                borderRadius: 12,
                padding: "22px 20px",
                borderTop: `2px solid ${["#58a6ff","#bc8cff","#3fb950","#f0883e","#58a6ff","#bc8cff","#3fb950","#f0883e"][i]}33`,
              }}
            >
              <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 7, letterSpacing: "-0.2px" }}>{f.title}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary, #8b949e)", lineHeight: 1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────── */}
      <section
        id="how-it-works"
        style={{
          padding: "80px 24px",
          background: "var(--bg-surface, #161b22)",
          borderTop: "1px solid var(--border, #21262d)",
          borderBottom: "1px solid var(--border, #21262d)",
        }}
      >
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "2px", color: "#bc8cff", textTransform: "uppercase", marginBottom: 12 }}>
              Getting Started
            </div>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 38px)", fontWeight: 800, letterSpacing: "-1px" }}>
              Live in under 2 minutes
            </h2>
            <p style={{ color: "var(--text-secondary,#8b949e)", fontSize: 15, maxWidth: 420, margin: "12px auto 0" }}>
              No setup fees, no approval process. Register with your email and your team is up and running immediately.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {steps.map((s, i) => (
              <div
                key={s.num}
                style={{
                  display: "flex",
                  gap: 20,
                  alignItems: "flex-start",
                  background: "var(--bg-base, #0d1117)",
                  border: "1px solid var(--border, #21262d)",
                  borderRadius: 12,
                  padding: "22px 24px",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: i % 2 === 0 ? "rgba(88,166,255,0.12)" : "rgba(188,140,255,0.12)",
                    border: `1px solid ${i % 2 === 0 ? "rgba(88,166,255,0.35)" : "rgba(188,140,255,0.35)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 800,
                    color: i % 2 === 0 ? "#58a6ff" : "#bc8cff",
                    letterSpacing: "-0.5px",
                  }}
                >
                  {s.num}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, letterSpacing: "-0.2px" }}>{s.title}</div>
                  <div style={{ fontSize: 13.5, color: "var(--text-secondary, #8b949e)", lineHeight: 1.65 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────── */}
      <section style={{ padding: "72px 24px" }}>
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            background: "linear-gradient(135deg, rgba(88,166,255,0.08) 0%, rgba(188,140,255,0.08) 100%)",
            border: "1px solid rgba(88,166,255,0.2)",
            borderRadius: 16,
            padding: "52px 40px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 16 }}>🚀</div>
          <h2
            style={{
              fontSize: "clamp(22px, 4vw, 34px)",
              fontWeight: 800,
              letterSpacing: "-1px",
              marginBottom: 14,
              background: "linear-gradient(135deg, #e6edf3 30%, #bc8cff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Ready to manage your organization?
          </h2>
          <p style={{ fontSize: 15, color: "var(--text-secondary,#8b949e)", marginBottom: 32, lineHeight: 1.65, maxWidth: 440, margin: "0 auto 32px" }}>
            Create your free account, set up your first workspace, and have your whole team collaborating in minutes.
          </p>
          <button
            onClick={onGetStarted}
            style={{
              background: "linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "14px 40px",
              fontSize: 15.5,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 24px rgba(88,166,255,0.3)",
            }}
          >
            Create Your Free Account →
          </button>
          <div style={{ fontSize: 12, color: "var(--text-secondary,#8b949e)", marginTop: 14 }}>
            Instant access · No setup required
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid var(--border, #21262d)",
          padding: "24px 40px",
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
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 11,
              color: "#fff",
            }}
          >
            T
          </div>
          <span>TechSters ERP · Enterprise Resource Planning</span>
        </div>
        <div>Built with Express · Socket.IO · React · Prisma · Vercel</div>
      </footer>
    </div>
  );
}
