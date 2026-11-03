/**
 * Miniaturas de la wiki de LoL (MediaWiki): /images/<file> -> /images/thumb/<file>/<N>px-<file>.
 * Solo para URLs de wiki.leagueoflegends.com; cualquier otra (subidas propias, data:, rutas
 * relativas, ya en /thumb/) se devuelve tal cual.
 */
const WIKI_IMAGE = /^(https?:\/\/wiki\.leagueoflegends\.com\/[a-z-]+\/images\/)(?!thumb\/)([^/?#]+?\.(?:png|jpe?g|webp|gif))(\?[^#]*)?$/i;

export function thumbUrl(url: string, width: number): string {
  if (!url) return url;
  const match = WIKI_IMAGE.exec(url);
  if (!match) return url;
  const [, base, file, query = ''] = match;
  return `${base}thumb/${file}/${Math.round(width)}px-${file}${query}`;
}

/** Ancho de miniatura para un retrato pequeño (~64px) con zoom de encuadre: 256 / 512 / 1024. */
export function portraitThumbWidth(zoom = 1): number {
  if (zoom <= 1.25) return 256;
  if (zoom <= 2) return 512;
  return 1024;
}
