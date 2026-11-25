// In-memory Socket.IO online presence tracker (per process)
const userSockets = new Map<string, Set<string>>();

export function markUserConnected(userId: string, socketId: string) {
  let set = userSockets.get(userId);
  if (!set) {
    set = new Set<string>();
    userSockets.set(userId, set);
  }
  set.add(socketId);
}

export function markUserDisconnected(userId: string, socketId: string) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) {
    userSockets.delete(userId);
  }
}

export function isUserOnline(userId: string): boolean {
  const set = userSockets.get(userId);
  return !!set && set.size > 0;
}

export function getOnlineUserIds(): string[] {
  return Array.from(userSockets.keys());
}
