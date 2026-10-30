import { createContext, useContext, type ReactNode } from 'react';
import type { AppRole } from './appRole';
import { roleCanEdit } from './appRole';

type AppRoleValue = {
  role: AppRole;
  /** Mutaciones globales (items, tienda, loot, historial…). Las fichas no lo usan. */
  canEdit: boolean;
};

const AppRoleContext = createContext<AppRoleValue | null>(null);

export function AppRoleProvider({ role, children }: { role: AppRole; children: ReactNode }) {
  return (
    <AppRoleContext.Provider value={{ role, canEdit: roleCanEdit(role) }}>
      {children}
    </AppRoleContext.Provider>
  );
}

export function useAppRole(): AppRoleValue {
  const value = useContext(AppRoleContext);
  if (!value) throw new Error('useAppRole fuera de AppRoleProvider');
  return value;
}

export function useCanEdit(): boolean {
  return useAppRole().canEdit;
}
