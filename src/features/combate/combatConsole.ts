/** Desarrollo completo de cada acción de combate en la consola del navegador (para depurar). */
export function logCombat(entry: { title: string; lines: string[]; actor?: string }): void {
  const title = `[combate] ${entry.actor ? `${entry.actor} · ` : ''}${entry.title}`;
  if (entry.lines.length === 0) {
    console.log(title);
    return;
  }
  console.groupCollapsed(title);
  for (const line of entry.lines) if (line) console.log(`[combate] ${line}`);
  console.groupEnd();
}
