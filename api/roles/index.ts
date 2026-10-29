import { HttpError } from '../../server/errors';
import { queryValue, withErrors } from '../../server/http';
import { listRoles } from '../../server/store';
import roleById from './[id]';

// En Vercel, /api/roles/:id se reescribe a /api/roles?id=:id (vercel.json),
// así que este handler delega en el de un rol cuando llega ?id=.
export default withErrors(async (req, res) => {
  const id = queryValue(req.query, 'id')?.trim();
  if (id) return roleById(req, res);
  if (req.method !== 'GET') throw new HttpError(405, 'Método no permitido');
  res.status(200).json(await listRoles());
});