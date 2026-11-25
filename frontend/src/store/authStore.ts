import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "../lib/api";

interface AuthState {
  token: string | null;
  user: User | null;
  lastEmail: string | null;
  showFeedbackPrompt: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  clearFeedbackPrompt: () => void;
  openFeedbackPrompt: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      lastEmail: null,
      showFeedbackPrompt: false,
      setAuth: (token, user) => {
        localStorage.setItem("tk_token", token);
        localStorage.setItem("tk_last_email", user.email);
        set({
          token,
          user,
          lastEmail: user.email,
          showFeedbackPrompt: user.systemRole !== "ADMIN",
        });
      },
      logout: () => {
        localStorage.removeItem("tk_token");
        set((state) => ({
          token: null,
          user: null,
          lastEmail: state.lastEmail || localStorage.getItem("tk_last_email"),
          showFeedbackPrompt: false,
        }));
      },
      clearFeedbackPrompt: () => set({ showFeedbackPrompt: false }),
      openFeedbackPrompt: () => set({ showFeedbackPrompt: true }),
    }),
    { name: "tk-auth" }
  )
);
