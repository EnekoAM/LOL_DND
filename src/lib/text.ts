/** Clave de comparación para nombres escritos a mano en los JSON (mayúsculas y espacios inconsistentes). */
export const normalizeName = (name: string): string => name.trim().toLowerCase();

export const matchesSearch = (text: string, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  return needle === '' || text.toLowerCase().includes(needle);
};
