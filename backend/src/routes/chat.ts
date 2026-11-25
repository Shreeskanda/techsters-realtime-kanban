import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { generateLocalChatReply } from "../lib/chatbot";

export const chatRouter = Router();
chatRouter.use(authenticate);

const chatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  workspaceId: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(12)
    .optional(),
});

// POST /api/chat – local authorization-scoped workspace assistant
chatRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const parsed = chatRequestSchema.parse(req.body);
    const result = await generateLocalChatReply({
      userId: req.userId!,
      systemRole: req.systemRole || "MEMBER",
      message: parsed.message,
      workspaceId: parsed.workspaceId,
      history: parsed.history,
    });
    return res.status(result.status).json(result.data);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid chat request", details: err.errors });
    }
    console.error("Local chatbot error:", err);
    return res.status(500).json({ error: "Local assistant failed to process query" });
  }
});
