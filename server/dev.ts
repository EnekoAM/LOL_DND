import express, { type NextFunction, type Request, type Response } from 'express';
import champions from '../api/champions';
import craft from '../api/craft';
import health from '../api/health';
import history from '../api/history';
import items from '../api/items';
import liveToken from '../api/live-token';
import loot from '../api/loot';
import party from '../api/party';
import playerByName from '../api/players/[name]';
import players from '../api/players/index';
import roleById from '../api/roles/[id]';
import roles from '../api/roles/index';
import shop from '../api/shop';
import type { ApiHandler, ApiRequest, ApiResponse } from './http';
import { attachLiveSync } from './live';
import { ablyKey } from './livePublish';
import { loadEnv } from './env';

loadEnv();

const PORT = 3001;
// Con Ably activo (o LIVE_WS=0) no se abre el WebSocket local: todo va por Ably.
const useWs = !ablyKey() && process.env.LIVE_WS?.trim() !== '0';

function adapt(handler: ApiHandler) {
  return (req: Request, res: Response) => {
    const query: ApiRequest['query'] = {};
    for (const [key, value] of Object.entries({ ...req.query, ...req.params })) {
      if (typeof value === 'string') query[key] = value;
      else if (Array.isArray(value) && value.every(item => typeof item === 'string')) query[key] = value;
    }
    return handler(
      {
        method: req.method,
        query,
        headers: req.headers as ApiRequest['headers'],
        body: req.body,
      },
      res as unknown as ApiResponse,
    );
  };
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }
  next(error);
});

app.get('/api/health', adapt(health));
// Token corto de Ably para el navegador ({ enabled: false } si no hay ABLY_API_KEY).
app.get('/api/live-token', adapt(liveToken));
app.get('/api/champions', adapt(champions));
app.patch('/api/champions', adapt(champions));
app.get('/api/items', adapt(items));
app.patch('/api/items', adapt(items));
app.put('/api/items', adapt(items));
app.post('/api/craft', adapt(craft));
app.post('/api/shop', adapt(shop));
app.get('/api/history', adapt(history));
app.post('/api/history', adapt(history));
app.get('/api/loot', adapt(loot));
app.patch('/api/loot', adapt(loot));
app.get('/api/party', adapt(party));
// Cambiar el nivel recalcula los rangos de habilidad de todos los jugadores.
app.patch('/api/party', adapt(party));
// El cliente escribe con ?name= (igual que en Vercel); /:name se mantiene por compatibilidad.
app.get('/api/players', adapt(players));
app.patch('/api/players', adapt(players));
app.put('/api/players', adapt(players));
app.get('/api/players/:name', adapt(playerByName));
app.patch('/api/players/:name', adapt(playerByName));
app.put('/api/players/:name', adapt(playerByName));
app.get('/api/roles', adapt(roles));
app.patch('/api/roles', adapt(roles));
app.get('/api/roles/:id', adapt(roleById));
app.patch('/api/roles/:id', adapt(roleById));
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

const server = app.listen(PORT, () => {
  console.log(`API en http://localhost:${PORT}`);
  console.log(ablyKey() ? 'Ably activo (ABLY_API_KEY): avisos por Ably, WebSocket local desactivado.' : 'Sin ABLY_API_KEY: solo WebSocket local.');
  if (!process.env.MONGODB_URI?.trim()) {
    console.log('MONGODB_URI no está definido. Copia .env.example a .env y pega ahí la cadena.');
  }
});

if (useWs) {
  attachLiveSync(server);
  console.log(`WebSocket local en ws://localhost:${PORT}/ws`);
}

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') console.error(`El puerto ${PORT} está ocupado.`);
  else console.error(error.message);
  process.exit(1);
});
