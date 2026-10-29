import { HttpError } from '../server/errors';
import { assertWriteAccess, withErrors } from '../server/http';
import { getLoot, updateLootRules } from '../server/store';
import { parseLootRulesPatch } from '../server/validate';

export default withErrors(async (req, res) => {
  if (req.method === 'GET') {
    res.status(200).json(await getLoot());
    return;
  }
  if (req.method === 'PATCH') {
    assertWriteAccess(req);
    res.status(200).json(await updateLootRules(parseLootRulesPatch(req.body)));
    return;
  }
  throw new HttpError(405, 'Método no permitido');
});
