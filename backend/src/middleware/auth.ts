import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  systemRole?: "ADMIN" | "MEMBER";
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized – missing token" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, isActive: true, systemRole: true, lastSeenAt: true },
    });

    if (!user) {
      res.status(401).json({ error: "Unauthorized – user not found" });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: "Account deactivated. Contact your administrator." });
      return;
    }

    // Throttle lastSeenAt updates to avoid extra write overhead on every API call
    const now = new Date();
    if (!user.lastSeenAt || now.getTime() - user.lastSeenAt.getTime() > 120_000) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastSeenAt: now },
      }).catch(() => {});
    }

    req.userId = user.id;
    req.systemRole = user.systemRole;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized – invalid token" });
  }
};

export const requireWorkspaceMember = (allowedRoles: string[] = ["ADMIN", "MEMBER", "VIEWER"]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const workspaceId = (req.params.workspaceId || req.body.workspaceId || req.query.workspaceId) as string;
    if (!workspaceId) {
      next();
      return;
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });

    if (!member || !allowedRoles.includes(member.role)) {
      res.status(403).json({ error: "Forbidden – insufficient permissions" });
      return;
    }

    req.userRole = member.role;
    next();
  };
};
