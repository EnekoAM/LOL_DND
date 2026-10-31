import { useState } from 'react';
import type { Player } from '../../data/players';
import { useCanEdit } from '../../data/appRoleContext';
import type { CombatPatch } from './HpPanel';

const MAX_SHORT_RESTS = 2;

type Props = {
  player: Player;
  maxHp: number;
  maxMana: number;
  saving: boolean;
  error: string | null;
  onChange: (patch: CombatPatch) => void | Promise<void>;
};

function num(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Recupera la mitad de lo que falta hasta el máximo. */
function recoverHalf(current: number, max: number): number {
  if (max <= 0) return 0;
  const missing = Math.max(0, max - current);
  return Math.min(max, current + Math.ceil(missing / 2));
}

const RestPanel = ({ player, maxHp, maxMana, saving, error, onChange }: Props) => {
  const canEdit = useCanEdit();
  const [localError, setLocalError] = useState<string | null>(null);
  if (!canEdit) return null;

  const used = Math.min(MAX_SHORT_RESTS, Math.max(0, Math.floor(num(player.shortRestsUsed, 0))));
  const left = MAX_SHORT_RESTS - used;
  const actualHp = Math.min(maxHp, num(player.actualHp, maxHp));
  const actualMana = Math.min(maxMana, num(player.actualMana, maxMana));

  const shortRest = async () => {
    if (saving) return;
    setLocalError(null);
    if (left <= 0) {
      setLocalError('Ya has usado 2 descansos cortos. Haz un descanso largo.');
      return;
    }
    try {
      await onChange({
        actualHp: recoverHalf(actualHp, maxHp),
        actualMana: recoverHalf(actualMana, maxMana),
        shortRestsUsed: used + 1,
      });
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'No se pudo completar el descanso');
    }
  };

  const longRest = async () => {
    if (saving) return;
    setLocalError(null);
    try {
      await onChange({
        actualHp: maxHp,
        actualMana: maxMana,
        vidaTemporal: 0,
        escudo: 0,
        shortRestsUsed: 0,
      });
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'No se pudo completar el descanso');
    }
  };

  const shown = localError ?? error;

  return (
    <div className="sheet-rest">
      <div className="sheet-rest__label">Descansos</div>
      <div className="sheet-rest__meta">
        Cortos: {used}/{MAX_SHORT_RESTS}
        {left === 0 ? ' · hace falta un largo' : ''}
      </div>
      <div className="sheet-rest__row">
        <button
          type="button"
          className="sheet-rest__btn"
          disabled={saving || left <= 0}
          onClick={() => void shortRest()}
          title="Recupera la mitad de PG y maná que falten"
        >
          Descanso corto
        </button>
        <button
          type="button"
          className="sheet-rest__btn sheet-rest__btn--long"
          disabled={saving}
          onClick={() => void longRest()}
          title="Recupera PG y maná al máximo y reinicia los cortos"
        >
          Descanso largo
        </button>
      </div>
      {shown && <p className="sheet-rest__error" role="alert">{shown}</p>}
    </div>
  );
};

export default RestPanel;
