import { useEffect, useState } from 'react';
import type { Player } from '../../data/players';
import type { CombatPatch } from './HpPanel';

type Props = {
  player: Player;
  suggestedMax: number;
  saving: boolean;
  error: string | null;
  onChange: (patch: CombatPatch) => void | Promise<void>;
};

function suggestedOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const parseNonNegInt = (raw: string): number | null => {
  if (!raw.trim()) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
};

const ManaPanel = ({ player, suggestedMax, saving, error, onChange }: Props) => {
  const maxMana = suggestedOr(player.mana, Math.max(0, Math.floor(suggestedMax)));
  const actualMana = suggestedOr(player.actualMana, maxMana);

  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('1');
  const [draftActual, setDraftActual] = useState(String(actualMana));
  const [draftMax, setDraftMax] = useState(String(maxMana));

  useEffect(() => {
    if (editing) return;
    setDraftActual(String(actualMana));
    setDraftMax(String(maxMana));
  }, [actualMana, maxMana, editing]);

  const persist = async (patch: { mana: number; actualMana: number }) => {
    await onChange(patch);
  };

  const restore = () => {
    const value = parseNonNegInt(amount);
    if (value === null || value === 0 || saving) return;
    const baseActual = editing ? (parseNonNegInt(draftActual) ?? actualMana) : actualMana;
    const baseMax = editing ? (parseNonNegInt(draftMax) ?? maxMana) : maxMana;
    const nextActual = Math.min(baseMax, baseActual + value);
    if (editing) setDraftActual(String(nextActual));
    else void persist({ mana: baseMax, actualMana: nextActual });
    setAmount('1');
  };

  const spend = () => {
    const value = parseNonNegInt(amount);
    if (value === null || value === 0 || saving) return;
    const baseActual = editing ? (parseNonNegInt(draftActual) ?? actualMana) : actualMana;
    const baseMax = editing ? (parseNonNegInt(draftMax) ?? maxMana) : maxMana;
    const nextActual = Math.max(0, baseActual - value);
    if (editing) setDraftActual(String(nextActual));
    else void persist({ mana: baseMax, actualMana: nextActual });
    setAmount('1');
  };

  const openEdit = () => {
    setDraftActual(String(actualMana));
    setDraftMax(String(maxMana));
    setAmount('1');
    setEditing(true);
  };

  const finishEdit = async () => {
    const nextActual = parseNonNegInt(draftActual);
    const nextMax = parseNonNegInt(draftMax);
    if (nextActual === null || nextMax === null || saving) return;
    try {
      await persist({
        mana: nextMax,
        actualMana: Math.min(nextActual, nextMax),
      });
      setEditing(false);
    } catch {
      // Players muestra combatError.
    }
  };

  const pct = maxMana > 0 ? Math.min(100, Math.round((actualMana / maxMana) * 100)) : 0;

  if (editing) {
    return (
      <div className="sheet-resource sheet-resource--edit">
        <div className="sheet-resource__top">
          <div className="sheet-resource__label">Maná</div>
          <button
            type="button"
            className="sheet-hp__icon-btn"
            onClick={finishEdit}
            disabled={saving}
            aria-label="Guardar maná"
            title="Terminado"
          >
            ✓
          </button>
        </div>

        <div className="sheet-hp__adj sheet-hp__adj--row">
          <button type="button" className="sheet-hp__adj-btn" onClick={restore} disabled={saving}>
            ▲ Restaurar
          </button>
          <input
            className="sheet-hp__amount"
            inputMode="numeric"
            value={amount}
            onChange={event => setAmount(event.target.value.replace(/[^\d]/g, ''))}
            disabled={saving}
            aria-label="Cantidad"
          />
          <button type="button" className="sheet-hp__adj-btn" onClick={spend} disabled={saving}>
            ▼ Gastar
          </button>
        </div>

        <div className="sheet-hp__edit-fields">
          <label className="sheet-hp__field">
            <span>Actual</span>
            <input
              className="sheet-hp__input"
              inputMode="numeric"
              value={draftActual}
              onChange={event => setDraftActual(event.target.value.replace(/[^\d]/g, ''))}
              disabled={saving}
            />
          </label>
          <div className="sheet-hp__slash" aria-hidden="true">/</div>
          <label className="sheet-hp__field">
            <span>Máximo</span>
            <input
              className="sheet-hp__input"
              inputMode="numeric"
              value={draftMax}
              onChange={event => setDraftMax(event.target.value.replace(/[^\d]/g, ''))}
              disabled={saving}
            />
          </label>
        </div>

        <button type="button" className="sheet-hp__done" onClick={finishEdit} disabled={saving}>
          ✓ Terminado
        </button>
        {error && <p className="sheet-hp__error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="sheet-resource">
      <div className="sheet-resource__top">
        <div className="sheet-resource__label">Maná</div>
        <button
          type="button"
          className="sheet-hp__icon-btn"
          onClick={openEdit}
          disabled={saving}
          aria-label="Editar maná"
          title="Editar"
        >
          ✎
        </button>
      </div>
      <div className="sheet-resource__head sheet-resource__head--values">
        <span>{actualMana} / {maxMana}</span>
        <span>{pct}%</span>
      </div>
      <div className="sheet-resource__track" aria-hidden="true">
        <div className="sheet-resource__fill sheet-resource__fill--mana" style={{ width: `${pct}%` }} />
      </div>
      {error && <p className="sheet-hp__error">{error}</p>}
    </div>
  );
};

export default ManaPanel;
