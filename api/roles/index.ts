import { HttpError } from '../../server/errors';
import { queryValue, withErrors } from '../../server/http';
import { getRole, listRoles } from '../../server/store';

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Método no permitido');
  const id = queryValue(req.query, 'id')?.trim();
  res.status(200).json(id ? await getRole(id) : await listRoles());
});
