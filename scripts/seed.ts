import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Document } from 'mongodb';
import { closeDb, getDb } from '../server/db';
import { logError } from '../server/errors';
import { loadEnv } from '../server/env';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath: string): unknown {
  const text = readFileSync(join(root, relativePath), 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

function singleDoc(value: unknown, file: string): Record<string, unknown> {
  if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== 'object') {
    throw new Error(`${file} tiene que ser una lista con un solo documento`);
  }
  return value[0] as Record<string, unknown>;
}

async function seed() {
  const resetParty = process.argv.includes('--reset-party');
  const db = await getDb();
  const lootDoc = singleDoc(readJson('src/json/loot.json'), 'loot.json');
  const partyDoc = singleDoc(readJson('src/json/party.json'), 'party.json');

  const loot = db.collection<Document & { _id: string }>('loot');
  const party = db.collection<Document & { _id: string }>('party');

  await loot.replaceOne({ _id: 'tables' }, { ...lootDoc, _id: 'tables' }, { upsert: true });

  if (resetParty) {
    await party.replaceOne({ _id: 'current' }, { ...partyDoc, _id: 'current' }, { upsert: true });
  } else {
    await party.updateOne(
      { _id: 'current' },
      { $setOnInsert: { ...partyDoc, _id: 'current' } },
      { upsert: true },
    );
  }

  console.log(`Base "${db.databaseName}": loot actualizado.`);
  console.log(resetParty ? 'Grupo: reiniciado con party.json' : 'Grupo: conservado si ya existía');
}

loadEnv();
seed()
  .catch(error => {
    logError(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
