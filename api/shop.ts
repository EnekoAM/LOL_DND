import { HttpError } from '../server/errors';
import { assertWriteAccess, withErrors } from '../server/http';
import { tradeShop } from '../server/store';
import { parseShopOrder } from '../server/validate';
import { withLive } from '../server/livePublish';

export default withLive({ POST: ['items', 'party', 'history'] }, withErrors(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Método no permitido');
  assertWriteAccess(req);
  res.status(200).json(await tradeShop(parseShopOrder(req.body)));
}));
