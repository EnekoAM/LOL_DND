import { useSyncExternalStore } from 'react';
import { useCanEdit } from '../../data/appRoleContext';
import { partyRelationsForPlayers, subscribeParty } from '../../data/party';

/** Pestaña Relaciones: el admin siempre la ve; los players solo si el admin la activó. */
export function useRelationsTabVisible(): boolean {
  const canEdit = useCanEdit();
  const forPlayers = useSyncExternalStore(subscribeParty, partyRelationsForPlayers);
  return canEdit || forPlayers;
}
