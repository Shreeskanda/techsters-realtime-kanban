import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { authRouter } from "./routes/auth";
import { workspaceRouter } from "./routes/workspaces";
import { boardRouter } from "./routes/boards";
import { columnRouter } from "./routes/columns";
import { taskRouter } from "./routes/tasks";
import { commentRouter } from "./routes/comments";
import { activityRouter } from "./routes/activity";
import { exportRouter } from "./routes/export";
import { joinRouter } from "./routes/joinRequests";
import { feedbackRouter } from "./routes/feedback";
import { adminRouter } from "./routes/admin";
import { memoryRouter } from "./routes/memory";
import { blockerRouter } from "./routes/blockers";
import { handoffRouter } from "./routes/handoffs";
import { healthRouter } from "./routes/health";
import { chatRouter } from "./routes/chat";
import { setupSocketIO } from "./socket";
import { setIO } from "./lib/io";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const allowedOrigins = new Set(
  [
    process.env.CLIENT_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
    "http://localhost:5173",
  ].filter(Boolean) as string[]
);

const corsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (
    !origin ||
    allowedOrigins.has(origin) ||
    /^https:\/\/techsters-realtime-kanban[a-z0-9-]*\.vercel\.app$/.test(origin) ||
    origin.startsWith("http://localhost:")
  ) {
    return callback(null, true);
  }
  return callback(new Error("CORS origin not allowed"));
};

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});
setIO(io);

// Middleware
app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", project: "TechSters Collaborative Kanban" });
});

// API Routes
app.use("/api/auth", authRouter);
app.use("/api/workspaces", workspaceRouter);
app.use("/api/workspaces", activityRouter);
app.use("/api/workspaces", exportRouter);
app.use("/api/boards", boardRouter);
app.use("/api/boards", columnRouter);
app.use("/api/columns", columnRouter);
app.use("/api/tasks", taskRouter);
app.use("/api/tasks", commentRouter);
app.use("/api/join-requests", joinRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/admin", adminRouter);
app.use("/api/chat", chatRouter);
app.use("/api", memoryRouter);
app.use("/api", blockerRouter);
app.use("/api", handoffRouter);
app.use("/api", healthRouter);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

setupSocketIO(io);

const PORT = Number(process.env.PORT) || 5000;
if (!process.env.VERCEL) {
  httpServer.listen(PORT, () => {
    console.log(`🚀 TechSters Kanban Server running on port ${PORT}`);
    console.log(`📡 Socket.IO enabled`);
  });
}

export default httpServer;
