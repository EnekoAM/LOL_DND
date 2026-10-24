import { HttpError } from '../server/errors';
import { withErrors } from '../server/http';
import { getLoot } from '../server/store';

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Método no permitido');
  res.status(200).json(await getLoot());
});
