import { HttpError } from '../server/errors';
import { assertWriteAccess, withErrors } from '../server/http';
import { listHistory, revertHistory } from '../server/store';
import { parseHistoryRevert } from '../server/validate';
import { withLive } from '../server/livePublish';

export default withLive({ POST: ['items', 'party', 'history'] }, withErrors(async (req, res) => {
  if (req.method === 'GET') {
    res.status(200).json(await listHistory());
    return;
  }
  if (req.method === 'POST') {
    assertWriteAccess(req);
    const { id, kind } = parseHistoryRevert(req.body);
    res.status(200).json(await revertHistory(kind, id));
    return;
  }
  throw new HttpError(405, 'Método no permitido');
}));
