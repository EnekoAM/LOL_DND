import { useState } from 'react';
import type { CombatParticipant } from '../../data/combat';
import { participantHp } from './combatHp';
import './CombatManualDamage.css';

/**
 * Para quien no ve la vida de un enemigo (players): apuntar a mano el daño que le han hecho (p. ej. tirado con dados).
 * Va por el mismo camino de daño que las habilidades (escudo → vida temporal → vida). La vida real sigue oculta:
 * solo se ve el daño recibido (vida máx. − vida actual).
 */
export default function CombatManualDamage({ participant, onDamage }: { participant: CombatParticipant; onDamage: (amount: number) => Promise<unknown> }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<number | null>(null);
  const hp = participantHp(participant);
  const taken = hp && typeof hp.max === 'number' && Number.isFinite(hp.max) ? Math.max(0, Math.round(hp.max - hp.current)) : null;

  const apply = () => {
    if (busy) return;
    const amount = Number(draft.trim());
    if (!Number.isInteger(amount) || amount < 1 || amount > 99999) {
      setError('Pon un número entero de daño (1 o más)');
      return;
    }
    setBusy(true);
    setError(null);
    onDamage(amount)
      .then(() => { setLast(amount); setDraft(''); })
      .catch(caught => setError(caught instanceof Error ? caught.message : 'No se pudo aplicar el daño'))
      .finally(() => setBusy(false));
  };

  return (
    <div className="combat-manual-dmg">
      <div className="combat-manual-dmg__head">
        <span className="combat-manual-dmg__hidden">Vida ?</span>
        {taken !== null && <span className="combat-manual-dmg__taken">Daño recibido: <b>{taken}</b></span>}
      </div>
      <div className="combat-manual-dmg__row">
        <input
          inputMode="numeric"
          placeholder="Daño hecho"
          value={draft}
          disabled={busy || participant.defeated}
          onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
          aria-label={`Daño hecho a ${participant.name}`}
        />
        <button type="button" className="combat-btn combat-btn--small combat-btn--gold" disabled={busy || !draft.trim() || participant.defeated} onClick={apply}>
          Aplicar
        </button>
      </div>
      {last !== null && !error && <p className="combat-manual-dmg__note">−{last} aplicado</p>}
      {error && <p className="combat-page__error">{error}</p>}
    </div>
  );
}
