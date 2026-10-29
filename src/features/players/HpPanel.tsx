import { useEffect, useState } from 'react';
import type { Player } from '../../data/players';
import { hpSyncPatch } from '../calculos/playerTotals';

export type CombatPatch = {
  hp?: number;
  actualHp?: number;
  escudo?: number;
  vidaTemporal?: number;
  mana?: number;
  actualMana?: number;
};

type Props = {
  player: Player;
  /** Máximo sugerido por el total de Cálculos (si aún no hay `hp` guardado). */
  suggestedMax: number;
  /**
   * HP TOTAL de la tabla (rol×nivel + equipo + extra). Si viene, el máximo queda vinculado
   * a la tabla y no se edita a mano; undefined = ficha sin rol, máximo manual.
   */
  linkedMax?: number;
  saving: boolean;
  error: string | null;
  onChange: (patch: CombatPatch) => void | Promise<void>;
};

function suggestedOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function applyDamage(
  amount: number,
  state: { actualHp: number; escudo: number; vidaTemporal: number },
): { actualHp: number; escudo: number; vidaTemporal: number } {
  let left = amount;
  let { actualHp, escudo, vidaTemporal } = state;
  if (left > 0 && escudo > 0) {
    const take = Math.min(escudo, left);
    escudo -= take;
    left -= take;
  }
  if (left > 0 && vidaTemporal > 0) {
    const take = Math.min(vidaTemporal, left);
    vidaTemporal -= take;
    left -= take;
  }
  if (left > 0) actualHp = Math.max(0, actualHp - left);
  return { actualHp, escudo, vidaTemporal };
}

const parseNonNegInt = (raw: string): number | null => {
  if (!raw.trim()) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
};

const HpPanel = ({ player, suggestedMax, linkedMax, saving, error, onChange }: Props) => {
  const linked = linkedMax !== undefined;
  // Vinculado: se muestra ya el valor alineado con la tabla aunque el guardado vaya por detrás.
  const synced = linked ? hpSyncPatch(player, linkedMax) : null;
  const maxHp = linked ? linkedMax : suggestedOr(player.hp, Math.max(0, Math.floor(suggestedMax)));
  const actualHp = synced?.actualHp ?? Math.min(maxHp, suggestedOr(player.actualHp, maxHp));
  const escudo = suggestedOr(player.escudo, 0);
  const vidaTemporal = suggestedOr(player.vidaTemporal, 0);

  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('1');
  const [draftActual, setDraftActual] = useState(String(actualHp));
  const [draftMax, setDraftMax] = useState(String(maxHp));
  const [draftTemp, setDraftTemp] = useState(String(vidaTemporal));
  const [draftEscudo, setDraftEscudo] = useState(String(escudo));

  useEffect(() => {
    if (editing) return;
    setDraftActual(String(actualHp));
    setDraftMax(String(maxHp));
    setDraftTemp(String(vidaTemporal));
    setDraftEscudo(String(escudo));
  }, [actualHp, maxHp, vidaTemporal, escudo, editing]);

  const persist = async (patch: CombatPatch) => {
    await onChange({
      hp: patch.hp,
      actualHp: patch.actualHp,
      escudo: patch.escudo,
      vidaTemporal: patch.vidaTemporal,
    });
  };

  const heal = () => {
    const value = parseNonNegInt(amount);
    if (value === null || value === 0 || saving) return;
    const baseActual = editing ? (parseNonNegInt(draftActual) ?? actualHp) : actualHp;
    const baseMax = editing && !linked ? (parseNonNegInt(draftMax) ?? maxHp) : maxHp;
    const nextActual = Math.min(baseMax, baseActual + value);
    if (editing) {
      setDraftActual(String(nextActual));
    } else {
      persist({ hp: baseMax, actualHp: nextActual, escudo, vidaTemporal });
    }
    setAmount('1');
  };

  const damage = () => {
    const value = parseNonNegInt(amount);
    if (value === null || value === 0 || saving) return;
    const baseActual = editing ? (parseNonNegInt(draftActual) ?? actualHp) : actualHp;
    const baseMax = editing && !linked ? (parseNonNegInt(draftMax) ?? maxHp) : maxHp;
    const baseTemp = editing ? (parseNonNegInt(draftTemp) ?? vidaTemporal) : vidaTemporal;
    const baseEscudo = editing ? (parseNonNegInt(draftEscudo) ?? escudo) : escudo;
    const next = applyDamage(value, {
      actualHp: baseActual,
      escudo: baseEscudo,
      vidaTemporal: baseTemp,
    });
    if (editing) {
      setDraftActual(String(next.actualHp));
      setDraftTemp(String(next.vidaTemporal));
      setDraftEscudo(String(next.escudo));
    } else {
      persist({
        hp: baseMax,
        actualHp: next.actualHp,
        escudo: next.escudo,
        vidaTemporal: next.vidaTemporal,
      });
    }
    setAmount('1');
  };

  const openEdit = () => {
    setDraftActual(String(actualHp));
    setDraftMax(String(maxHp));
    setDraftTemp(String(vidaTemporal));
    setDraftEscudo(String(escudo));
    setAmount('1');
    setEditing(true);
  };

  const finishEdit = async () => {
    const nextActual = parseNonNegInt(draftActual);
    const nextMax = linked ? maxHp : parseNonNegInt(draftMax);
    const nextTemp = parseNonNegInt(draftTemp);
    const nextEscudo = parseNonNegInt(draftEscudo);
    if (
      nextActual === null ||
      nextMax === null ||
      nextTemp === null ||
      nextEscudo === null ||
      saving
    ) {
      return;
    }
    try {
      await persist({
        hp: nextMax,
        actualHp: Math.min(nextActual, nextMax),
        vidaTemporal: nextTemp,
        escudo: nextEscudo,
      });
      setEditing(false);
    } catch {
      // El error lo muestra Players vía combatError.
    }
  };

  if (editing) {
    return (
      <div className="sheet-hp sheet-hp--edit">
        <div className="sheet-hp__top">
          <div className="sheet-hp__label">Puntos de golpe</div>
          <button
            type="button"
            className="sheet-hp__icon-btn"
            onClick={finishEdit}
            disabled={saving}
            aria-label="Guardar puntos de golpe"
            title="Terminado"
          >
            ✓
          </button>
        </div>

        <div className="sheet-hp__adj sheet-hp__adj--row">
          <button type="button" className="sheet-hp__adj-btn" onClick={heal} disabled={saving}>
            ▲ Curar
          </button>
          <input
            className="sheet-hp__amount"
            inputMode="numeric"
            value={amount}
            onChange={event => setAmount(event.target.value.replace(/[^\d]/g, ''))}
            disabled={saving}
            aria-label="Cantidad"
          />
          <button type="button" className="sheet-hp__adj-btn" onClick={damage} disabled={saving}>
            ▼ Daño
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
          <label
            className="sheet-hp__field"
            title={linked ? 'Sale del HP TOTAL de la tabla (rol × nivel + equipo + extra)' : undefined}
          >
            <span>{linked ? 'Máximo (tabla)' : 'Máximo'}</span>
            <input
              className="sheet-hp__input"
              inputMode="numeric"
              value={linked ? String(maxHp) : draftMax}
              onChange={event => setDraftMax(event.target.value.replace(/[^\d]/g, ''))}
              disabled={saving}
              readOnly={linked}
            />
          </label>
        </div>

        <div className="sheet-hp__edit-extra">
          <label className="sheet-hp__field">
            <span>Vida temporal</span>
            <input
              className="sheet-hp__input"
              inputMode="numeric"
              value={draftTemp}
              onChange={event => setDraftTemp(event.target.value.replace(/[^\d]/g, ''))}
              disabled={saving}
            />
          </label>
          <label className="sheet-hp__field">
            <span>Escudo</span>
            <input
              className="sheet-hp__input"
              inputMode="numeric"
              value={draftEscudo}
              onChange={event => setDraftEscudo(event.target.value.replace(/[^\d]/g, ''))}
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

  const hpPct = maxHp > 0 ? Math.max(0, Math.min(100, Math.round((actualHp / maxHp) * 100))) : 0;
  const hpColor = hpPct > 50 ? '#4caf50' : hpPct > 25 ? '#e0a030' : '#c0392b';

  return (
    <div className="sheet-resource">
      <div className="sheet-resource__top">
        <div className="sheet-resource__label">Puntos de golpe</div>
        <button
          type="button"
          className="sheet-hp__icon-btn"
          onClick={openEdit}
          disabled={saving}
          aria-label="Editar puntos de golpe"
          title="Editar"
        >
          ✎
        </button>
      </div>
      <div className="sheet-resource__head sheet-resource__head--values">
        <span>
          {actualHp} / {maxHp}
          {vidaTemporal > 0 && (
            <span className="sheet-hp__badge sheet-hp__badge--temp" title="Vida temporal" style={{ marginLeft: 6 }}>
              +{vidaTemporal}
            </span>
          )}
          {escudo > 0 && (
            <span className="sheet-hp__badge sheet-hp__badge--escudo" title="Escudo" style={{ marginLeft: 4 }}>
              {escudo}
            </span>
          )}
        </span>
        <span>{hpPct}%</span>
      </div>
      <div className="sheet-resource__track" aria-hidden="true">
        <div className="sheet-resource__fill" style={{ width: `${hpPct}%`, background: hpColor }} />
      </div>
      {error && <p className="sheet-hp__error">{error}</p>}
    </div>
  );
};

export default HpPanel;
