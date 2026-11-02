# LOL_DND

Frontend (Vite + React). La API está en `../server` (repo aparte, desplegado en Render).

En local:
- `npm run dev:api` (arranca `../server`, puerto 3001) — o `npm run dev` dentro de `../server`.
- `npm run dev` (Vite; su proxy manda `/api` y `/ws` a `localhost:3001`).

Seed y migraciones de Mongo: ahora en `../server` (`npm run seed`, `npm run migrate:*`).

Para actualizar el json de los objetos con el script de python:
cd src/json
python items_conversion_tsv_json.py