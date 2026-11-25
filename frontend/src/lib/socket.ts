import { io, Socket } from "socket.io-client";
import { getToken } from "./api";

const envSocketUrl = import.meta.env.VITE_SOCKET_URL;
const SOCKET_URL = import.meta.env.PROD
  ? envSocketUrl && !envSocketUrl.includes("localhost")
    ? envSocketUrl
    : undefined
  : envSocketUrl || "http://localhost:5000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const opts = {
      auth: { token: getToken() },
      transports: import.meta.env.PROD ? ["websocket"] : ["websocket", "polling"],
      autoConnect: false,
    };
    socket = SOCKET_URL ? io(SOCKET_URL, opts) : io(opts);
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) {
    s.auth = { token: getToken() };
    s.connect();
  }
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
