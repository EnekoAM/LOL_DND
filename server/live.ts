import type { Server } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { WebSocket, WebSocketServer } from 'ws';

/**
 * Sincronización en vivo entre pestañas: tras cada escritura correcta se avisa a todos
 * los navegadores conectados de qué recurso cambió. No se manda el documento; cada
 * pestaña lo vuelve a pedir por REST. Solo funciona con el servidor de `npm run dev:api`
 * (en Vercel las funciones serverless no mantienen WebSockets).
 */
export type LiveResource = 'party' | 'players' | 'items' | 'loot' | 'roles' | 'champions' | 'history';

export type LiveEvent = {
  type: 'changed';
  resources: LiveResource[];
  /** Jugador concreto, si el cambio vino de /api/players/:name. */
  name?: string;
  /** Pestaña que hizo el cambio (cabecera X-Client-Id); ella misma lo ignora. */
  clientId?: string;
};

export const LIVE_PATH = '/ws';

let wss: WebSocketServer | undefined;

export function attachLiveSync(server: Server): void {
  wss = new WebSocketServer({ server, path: LIVE_PATH });
  wss.on('connection', socket => {
    (socket as WebSocket & { alive?: boolean }).alive = true;
    socket.on('pong', () => {
      (socket as WebSocket & { alive?: boolean }).alive = true;
    });
    socket.on('error', () => socket.terminate());
  });

  // Latido: corta las conexiones muertas (portátil suspendido, wifi caída…).
  const heartbeat = setInterval(() => {
    for (const client of wss?.clients ?? []) {
      const socket = client as WebSocket & { alive?: boolean };
      if (socket.alive === false) {
        socket.terminate();
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
  }, 30_000);
  wss.on('close', () => clearInterval(heartbeat));
}

export function broadcast(event: Omit<LiveEvent, 'type'>): void {
  if (!wss || event.resources.length === 0) return;
  const message = JSON.stringify({ type: 'changed', ...event } satisfies LiveEvent);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length <= 100 ? trimmed : undefined;
}

/**
 * Middleware para rutas que escriben: cuando la respuesta sale con éxito (2xx),
 * avisa de los recursos indicados.
 */
export function notifies(...resources: LiveResource[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      const name = typeof req.params.name === 'string' ? req.params.name : undefined;
      broadcast({ resources, name, clientId: headerValue(req.headers['x-client-id']) });
    });
    next();
  };
}
