import { useCallback, useEffect, useState } from 'react';

const readStoredSet = (key: string): Set<string> => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

export function useStoredSet(key: string) {
  const [values, setValues] = useState(() => readStoredSet(key));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify([...values]));
    } catch {
      // Sin acceso a localStorage (modo privado, cuota llena): el conjunto solo dura la sesión.
    }
  }, [key, values]);

  const toggle = useCallback((value: string) => {
    setValues(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  return [values, toggle] as const;
}
