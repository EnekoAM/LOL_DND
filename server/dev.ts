import express, { type NextFunction, type Request, type Response } from 'express';
import champions from '../api/champions';
import craft from '../api/craft';
import health from '../api/health';
import history from '../api/history';
import items from '../api/items';
import loot from '../api/loot';
import party from '../api/party';
import playerByName from '../api/players/[name]';
import players from '../api/players/index';
import roleById from '../api/roles/[id]';
import roles from '../api/roles/index';
import shop from '../api/shop';
import type { ApiHandler, ApiRequest, ApiResponse } from './http';
import { loadEnv } from './env';

loadEnv();

const PORT = 3001;

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
app.get('/api/champions', adapt(champions));
app.patch('/api/champions', adapt(champions));
app.get('/api/items', adapt(items));
app.patch('/api/items', adapt(items));
  app.post('/api/craft', adapt(craft));
  app.post('/api/shop', adapt(shop));
app.get('/api/history', adapt(history));
app.post('/api/history', adapt(history));
app.get('/api/loot', adapt(loot));
app.patch('/api/loot', adapt(loot));
app.get('/api/party', adapt(party));
app.patch('/api/party', adapt(party));
app.get('/api/players', adapt(players));
app.get('/api/players/:name', adapt(playerByName));
app.patch('/api/players/:name', adapt(playerByName));
app.put('/api/players/:name', adapt(playerByName));
app.get('/api/roles', adapt(roles));
app.get('/api/roles/:id', adapt(roleById));
app.patch('/api/roles/:id', adapt(roleById));
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

const server = app.listen(PORT, () => {
  console.log(`API en http://localhost:${PORT}`);
  if (!process.env.MONGODB_URI?.trim()) {
    console.log('MONGODB_URI no está definido. Copia .env.example a .env y pega ahí la cadena.');
  }
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') console.error(`El puerto ${PORT} está ocupado.`);
  else console.error(error.message);
  process.exit(1);
});
