import { HttpError } from '../server/errors';
import { assertWriteAccess, queryValue, withErrors, type ApiRequest } from '../server/http';
import { createAugment, deleteAugment, listAugments, updateAugment } from '../server/store';
import { parseAugmentInput, parseTicketId } from '../server/validate';
import { withLive } from '../server/livePublish';

/** Rol blando (localStorage) que manda el cliente; igual de confiable que el resto de la app. */
function assertAdminRole(req: ApiRequest): void {
  const header = req.headers?.['x-app-role'];
  const role = Array.isArray(header) ? header[0] : header;
  if (role?.trim() !== 'admin') throw new HttpError(403, 'Solo el admin puede gestionar los aumentos');
}

function augmentId(req: ApiRequest): string {
  try {
    return parseTicketId(queryValue(req.query, 'id'), req.body);
  } catch {
    throw new HttpError(400, 'Falta el aumento');
  }
}

export default withLive({ POST: ['augments'], PATCH: ['augments'], DELETE: ['augments'] }, withErrors(async (req, res) => {
  if (req.method === 'GET') {
    res.status(200).json(await listAugments());
    return;
  }
  if (req.method === 'POST') {
    assertWriteAccess(req);
    assertAdminRole(req);
    res.status(201).json(await createAugment(parseAugmentInput(req.body)));
    return;
  }
  if (req.method === 'PATCH') {
    assertWriteAccess(req);
    assertAdminRole(req);
    res.status(200).json(await updateAugment(augmentId(req), parseAugmentInput(req.body, true)));
    return;
  }
  if (req.method === 'DELETE') {
    assertWriteAccess(req);
    assertAdminRole(req);
    res.status(200).json(await deleteAugment(augmentId(req)));
    return;
  }
  throw new HttpError(405, 'Método no permitido');
}));
