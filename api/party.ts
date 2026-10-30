import { HttpError } from '../server/errors';
import { assertWriteAccess, withErrors } from '../server/http';
import { getParty, updateParty } from '../server/store';
import { parsePartyPatch } from '../server/validate';
import { withLive } from '../server/livePublish';

export default withLive({ PATCH: ['party', 'players'] }, withErrors(async (req, res) => {
  if (req.method === 'GET') {
    res.status(200).json(await getParty());
    return;
  }
  if (req.method === 'PATCH') {
    assertWriteAccess(req);
    res.status(200).json(await updateParty(parsePartyPatch(req.body)));
    return;
  }
  throw new HttpError(405, 'Método no permitido');
}));
