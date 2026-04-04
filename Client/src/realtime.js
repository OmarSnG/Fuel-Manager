import { io } from "socket.io-client";
import { getToken } from "./api";

const SOCKET_URL = import.meta.env.DEV
  ? "http://192.168.1.46:4000"
  : "";

export const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnection: true,
  auth: { token: getToken() },
});

// Mettre a jour le token quand il change (reconnexion apres login)
export function updateSocketAuth() {
  socket.auth = { token: getToken() };
  if (socket.connected) {
    socket.disconnect().connect();
  }
}
