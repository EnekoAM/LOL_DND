import { HttpError } from '../server/errors';
import { assertWriteAccess, queryValue, withErrors } from '../server/http';
import { getItems, grantItem } from '../server/store';
import { parseRollRecord } from '../server/validate';

export default withErrors(async (req, res) => {
  const nombre = queryValue(req.query, 'nombre')?.trim();

  if (req.method === 'GET') {
    res.status(200).json(await getItems(nombre || undefined));
    return;
  }
  if (req.method === 'PATCH') {
    assertWriteAccess(req);
    if (!nombre) throw new HttpError(400, 'Falta el nombre del ítem');
    res.status(200).json(await grantItem(nombre, parseRollRecord(req.body)));
    return;
  }
  throw new HttpError(405, 'Método no permitido');
});
