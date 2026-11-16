import { readAppRole } from './appRole';

export type TicketStatus = 'pending' | 'accepted' | 'rejected' | 'completed';

/** Comentario de una sugerencia pendiente (solo se añaden; no se editan ni se borran). */
export type TicketComment = { id: string; text: string; author?: string; createdAt: string };

/** Sugerencia (ticket) guardada en Mongo. Crear: cualquiera. Aceptar/rechazar/borrar: solo admin. */
export type Ticket = {
  id: string;
  title: string;
  text: string;
  author?: string;
  status: TicketStatus;
  /** Archivada (solo completadas / rechazadas): no sale en las listas normales. */
  archived?: boolean;
  /** Del más viejo al más nuevo. */
  comments?: TicketComment[];
  /** ISO. */
  createdAt: string;
};

export const TICKET_TEXT_MAX = 1000;
export const TICKET_TITLE_MAX = 120;
export const TICKET_AUTHOR_MAX = 80;
export const TICKET_COMMENT_MAX = 600;

const normalizeComments = (value: unknown): TicketComment[] =>
  (Array.isArray(value) ? value : [])
    .filter((item): item is TicketComment => !!item && typeof item === 'object' && typeof (item as TicketComment).text === 'string')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

const OFFLINE = 'No se pudo contactar con la API. Arranca npm run dev:api';

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

async function call(path: string, init: RequestInit | undefined, fallback: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} ${fallback}`));
  return body;
}

export async function loadTickets(): Promise<Ticket[]> {
  const body = await call('/api/tickets', undefined, 'al cargar las sugerencias');
  if (!Array.isArray(body)) throw new Error('La API no devolvió las sugerencias');
  return (body as Ticket[]).map(ticket => ({
    ...ticket,
    title: typeof ticket.title === 'string' ? ticket.title : '',
    status: ticket.status === 'accepted' || ticket.status === 'rejected' || ticket.status === 'completed'
      ? ticket.status
      : 'pending',
    archived: ticket.archived === true,
    comments: normalizeComments(ticket.comments),
  }));
}

export async function createTicket(title: string, text: string, author?: string): Promise<Ticket> {
  const trimmedAuthor = author?.trim();
  const payload: { title: string; text: string; author?: string } = {
    title: title.trim(),
    text: text.trim(),
  };
  if (trimmedAuthor) payload.author = trimmedAuthor;
  const body = await call('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'al guardar la sugerencia');
  if (!body || typeof body !== 'object') throw new Error('La API no devolvió la sugerencia');
  return body as Ticket;
}

/** Solo admin: aceptar, rechazar, completar o volver a pendiente. */
export async function setTicketStatus(id: string, status: TicketStatus): Promise<Ticket> {
  if (readAppRole() !== 'admin') throw new Error('Solo el admin puede aceptar o rechazar sugerencias');
  const body = await call('/api/tickets', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-App-Role': 'admin' },
    body: JSON.stringify({ id, status }),
  }, 'al cambiar el estado de la sugerencia');
  if (!body || typeof body !== 'object') throw new Error('La API no devolvió la sugerencia');
  return body as Ticket;
}

/** Comentar una sugerencia pendiente (cualquiera, como crearla). Devuelve la sugerencia con el comentario. */
export async function addTicketComment(id: string, text: string, author?: string): Promise<Ticket> {
  const trimmedAuthor = author?.trim();
  const payload: { commentOn: string; text: string; author?: string } = { commentOn: id, text: text.trim() };
  if (trimmedAuthor) payload.author = trimmedAuthor;
  const body = await call('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'al guardar el comentario');
  if (!body || typeof body !== 'object') throw new Error('La API no devolvió la sugerencia');
  const ticket = body as Ticket;
  return { ...ticket, archived: ticket.archived === true, comments: normalizeComments(ticket.comments) };
}

/** Solo admin: archivar / desarchivar (no borra la sugerencia). */
export async function setTicketArchived(id: string, archived: boolean): Promise<Ticket> {
  if (readAppRole() !== 'admin') throw new Error('Solo el admin puede archivar sugerencias');
  const body = await call('/api/tickets', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-App-Role': 'admin' },
    body: JSON.stringify({ id, archived }),
  }, 'al archivar la sugerencia');
  if (!body || typeof body !== 'object') throw new Error('La API no devolvió la sugerencia');
  return body as Ticket;
}

/** Solo admin. Con rol user ni se llama a la API. */
export async function deleteTicket(id: string): Promise<void> {
  if (readAppRole() !== 'admin') throw new Error('Solo el admin puede borrar sugerencias');
  await call(`/api/tickets?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-App-Role': 'admin' },
  }, 'al borrar la sugerencia');
}
