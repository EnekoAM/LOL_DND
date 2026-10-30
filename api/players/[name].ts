import { HttpError } from '../../server/errors';
import { assertWriteAccess, queryValue, withErrors } from '../../server/http';
import { getPlayer, updatePlayer, upsertPlayer } from '../../server/store';
import { parsePlayerPatch, parsePlayerReplace } from '../../server/validate';
import { withLive } from '../../server/livePublish';

export default withLive({ PATCH: ['players'], PUT: ['players'] }, withErrors(async (req, res) => {
  const name = queryValue(req.query, 'name')?.trim();
  if (!name) throw new HttpError(400, 'Falta el nombre del jugador');

  if (req.method === 'GET') {
    res.status(200).json(await getPlayer(name));
    return;
  }
  if (req.method === 'PATCH') {
    assertWriteAccess(req);
    res.status(200).json(await updatePlayer(name, parsePlayerPatch(req.body)));
    return;
  }
  if (req.method === 'PUT') {
    assertWriteAccess(req);
    res.status(200).json(await upsertPlayer(name, parsePlayerReplace(req.body)));
    return;
  }
  throw new HttpError(405, 'Método no permitido');
}));
