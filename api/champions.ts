import { HttpError } from '../server/errors';
import { assertWriteAccess, queryValue, withErrors } from '../server/http';
import { getChampions, updateChampionAbility } from '../server/store';
import { parseChampionAbilityPatch } from '../server/validate';

export default withErrors(async (req, res) => {
  const champion = queryValue(req.query, 'champion')?.trim();

  if (req.method === 'GET') {
    res.status(200).json(await getChampions(champion || undefined));
    return;
  }
  if (req.method === 'PATCH') {
    assertWriteAccess(req);
    if (!champion) throw new HttpError(400, 'Falta el nombre del campeón');
    const patch = parseChampionAbilityPatch(req.body);
    res.status(200).json(await updateChampionAbility(champion, patch.slot, patch.ability));
    return;
  }
  throw new HttpError(405, 'Método no permitido');
});
