import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  systemRole: z.enum(["ADMIN", "MEMBER"]).optional().default("ADMIN"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signToken(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as string,
  } as jwt.SignOptions);
}

// POST /api/auth/check-email – returns {exists: bool, name?: string}
authRouter.post("/check-email", async (req, res) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, name: true } });
    return res.json({ exists: !!user, name: user?.name });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid email" });
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/register
authRouter.post("/register", async (req, res) => {
  try {
    const { name, email, password, systemRole } = registerSchema.parse(req.body);
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name: name.trim(), email: normalizedEmail, password: hashed, systemRole },
      select: { id: true, name: true, email: true, systemRole: true, createdAt: true },
    });

    return res.status(201).json({ token: signToken(user.id), user });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    return res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    return res.json({
      token: signToken(user.id),
      user: { id: user.id, name: user.name, email: user.email, systemRole: user.systemRole },
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    return res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me
authRouter.get("/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, name: true, email: true, avatar: true, systemRole: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(user);
  } catch {
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});
