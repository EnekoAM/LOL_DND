import { HttpError } from '../../server/errors';
import { queryValue, withErrors } from '../../server/http';
import { getPlayer, listPlayers } from '../../server/store';

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Método no permitido');
  const name = queryValue(req.query, 'name')?.trim();
  res.status(200).json(name ? await getPlayer(name) : await listPlayers());
});
