import { HttpError } from '../server/errors';
import { assertWriteAccess, queryValue, withErrors } from '../server/http';
import { getChampions, updateChampionAbility, updateChampionFields } from '../server/store';
import { parseChampionAbilityPatch, parseChampionFieldsPatch } from '../server/validate';
import { withLive } from '../server/livePublish';

export default withLive({ PATCH: ['champions'] }, withErrors(async (req, res) => {
  const champion = queryValue(req.query, 'champion')?.trim();

  if (req.method === 'GET') {
    res.status(200).json(await getChampions(champion || undefined));
    return;
  }
  if (req.method === 'PATCH') {
    assertWriteAccess(req);
    if (!champion) throw new HttpError(400, 'Falta el nombre del campeón');
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    if ('slot' in body) {
      const patch = parseChampionAbilityPatch(body);
      res.status(200).json(await updateChampionAbility(champion, patch.slot, patch.ability));
      return;
    }
    const fields = parseChampionFieldsPatch(body);
    res.status(200).json(await updateChampionFields(champion, fields));
    return;
  }
  throw new HttpError(405, 'Método no permitido');
}));
