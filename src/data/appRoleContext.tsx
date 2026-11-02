import { createContext, useContext, type ReactNode } from 'react';
import type { AppIdentity, AppRole } from './appRole';
import { roleCanEdit } from './appRole';

type AppRoleValue = {
  role: AppRole;
  /** Mutaciones globales (items, tienda, loot, historial…). Las fichas no lo usan. */
  canEdit: boolean;
  /** Solo User: player con el que entró o invitado. null para admin. */
  identity: AppIdentity | null;
  /** Nombre del player con el que entró el User (null si es admin o invitado). */
  playerName: string | null;
};

const AppRoleContext = createContext<AppRoleValue | null>(null);

export function AppRoleProvider({ role, identity = null, children }: { role: AppRole; identity?: AppIdentity | null; children: ReactNode }) {
  const who = role === 'user' ? identity : null;
  return (
    <AppRoleContext.Provider
      value={{ role, canEdit: roleCanEdit(role), identity: who, playerName: who?.kind === 'player' ? who.name : null }}
    >
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

/** Player con el que entró el User (null si admin o invitado). */
export function useMyPlayerName(): string | null {
  return useAppRole().playerName;
}
