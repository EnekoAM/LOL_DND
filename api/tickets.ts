import { HttpError } from '../server/errors';
import { assertWriteAccess, queryValue, withErrors, type ApiRequest } from '../server/http';
import { createTicket, deleteTicket, listTickets } from '../server/store';
import { parseTicketCreate, parseTicketId } from '../server/validate';
import { withLive } from '../server/livePublish';

/** Rol blando (localStorage) que manda el cliente; igual de confiable que el resto de la app. */
function assertAdminRole(req: ApiRequest): void {
  const header = req.headers?.['x-app-role'];
  const role = Array.isArray(header) ? header[0] : header;
  if (role?.trim() !== 'admin') throw new HttpError(403, 'Solo el admin puede borrar sugerencias');
}

export default withLive({ POST: ['tickets'], DELETE: ['tickets'] }, withErrors(async (req, res) => {
  if (req.method === 'GET') {
    res.status(200).json(await listTickets());
    return;
  }
  if (req.method === 'POST') {
    assertWriteAccess(req);
    res.status(201).json(await createTicket(parseTicketCreate(req.body)));
    return;
  }
  if (req.method === 'DELETE') {
    assertWriteAccess(req);
    assertAdminRole(req);
    res.status(200).json(await deleteTicket(parseTicketId(queryValue(req.query, 'id'), req.body)));
    return;
  }
  throw new HttpError(405, 'Método no permitido');
}));
