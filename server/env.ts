import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let loaded = false;

/** Rellena process.env con .env sin pisar variables que ya vengan del sistema. */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  const candidates = [
    join(process.cwd(), '.env'),
    join(dirname(fileURLToPath(import.meta.url)), '..', '.env'),
  ];
  const path = candidates.find(candidate => existsSync(candidate));
  if (!path) return;

  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
