import type { Document } from 'mongodb';
import { closeDb, getDb } from '../server/db';
import { logError } from '../server/errors';
import { loadEnv } from '../server/env';
import { DEFAULT_ROLE_TABLES } from './roleDefaults';

/**
 * Copia las tablas de rol × nivel (scripts/roleDefaults.ts) a la colección roles.
 * Un documento por rol: { _id: id, id, name, levels, order }.
 * Por defecto solo crea los roles que aún no existen.
 * Con --force sobrescribe nombre y niveles de los ya guardados.
 */
async function migrate() {
  const force = process.argv.includes('--force');
  const db = await getDb();
  const roles = db.collection<Document & { _id: string }>('roles');

  let written = 0;
  for (const [order, role] of DEFAULT_ROLE_TABLES.entries()) {
    const doc = { id: role.id, name: role.name, levels: role.levels, order };
    const updatedAt = new Date().toISOString();
    const result = force
      ? await roles.updateOne({ _id: role.id }, { $set: { ...doc, updatedAt } }, { upsert: true })
      : await roles.updateOne({ _id: role.id }, { $setOnInsert: { ...doc, updatedAt } }, { upsert: true });
    if (result.upsertedCount || result.modifiedCount) {
      written += 1;
      console.log(`${role.name}: ${role.levels.length} niveles guardados`);
    } else {
      console.log(`${role.name}: ya existía (usa --force para sobrescribir)`);
    }
  }
  const total = await roles.countDocuments();
  console.log(`Base "${db.databaseName}": ${written} roles escritos, ${total} en la colección roles.`);
}

loadEnv();
migrate()
  .catch(error => {
    logError(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
