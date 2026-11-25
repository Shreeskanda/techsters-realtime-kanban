import React, { useState } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const { token, user } = await api.auth.register(form);
        setAuth(token, user);
      } else {
        const { token, user } = await api.auth.login({ email: form.email, password: form.password });
        setAuth(token, user);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg">K</div>
            <span className="text-2xl font-bold text-white">TechSters Kanban</span>
          </div>
          <p className="text-slate-400 text-sm">AVISHKAR'26 · Real-Time Collaborative Board</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
          {/* Tab switcher */}
          <div className="flex border border-slate-600 rounded-lg p-1 mb-6">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === "login" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === "register" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  className="input"
                  placeholder="Alice Smith"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
            </div>

            {error && (
              <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2">
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="mt-6 p-4 bg-slate-900 rounded-lg border border-slate-600">
            <p className="text-xs text-slate-500 font-medium mb-2">Demo credentials</p>
            <div className="space-y-1 text-xs text-slate-400">
              <p>🔑 alice@techsters.dev / password123 (Admin)</p>
              <p>🔑 bob@techsters.dev / password123 (Member)</p>
              <p>🔑 carol@techsters.dev / password123 (Viewer)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
