import { useEffect, useState } from 'react';
import type { AbilityScoreKey, PlayerSheet } from '../../data/players';
import {
  ABILITY_SCORES,
  DEFAULT_SCORE,
  abilityScore,
  type AbilityScore,
} from '../calculos/playerSheets';
import { ROLE_TABLES, findRoleTable } from '../../data/roles';
import { STAT_COLUMNS, type StatKey } from '../calculos/statLine';

type Props = {
  sheet: PlayerSheet | undefined;
  saving: boolean;
  error: string | null;
  onSave: (sheet: PlayerSheet) => Promise<void>;
};

type Draft = {
  roleId: string;
  scores: Record<AbilityScoreKey, string>;
  extra: Record<StatKey, string>;
};

const SCORE_MIN = 1;
const SCORE_MAX = 30;

const formatModifier = (modifier: number): string =>
  modifier >= 0 ? `+${modifier}` : String(modifier);

function toDraft(sheet: PlayerSheet | undefined): Draft {
  const scores = {} as Record<AbilityScoreKey, string>;
  for (const { key } of ABILITY_SCORES) {
    const value = sheet?.scores?.[key];
    scores[key] = typeof value === 'number' ? String(value) : '';
  }
  const extra = {} as Record<StatKey, string>;
  for (const column of STAT_COLUMNS) {
    const value = sheet?.extra?.[column.key];
    extra[column.key] = value === undefined || value === 0 ? '' : String(value);
  }
  return { roleId: sheet?.roleId ?? ROLE_TABLES[0].id, scores, extra };
}

/** Devuelve la ficha o un mensaje de error en español. */
function fromDraft(draft: Draft, skills: PlayerSheet['skills']): PlayerSheet | string {
  const sheet: PlayerSheet = { roleId: draft.roleId };
  // Las competencias se editan en el panel de Habilidades; aquí solo se conservan.
  if (skills) sheet.skills = skills;

  const filled = ABILITY_SCORES.filter(({ key }) => draft.scores[key].trim() !== '');
  if (filled.length > 0) {
    const scores = {} as Record<AbilityScoreKey, number>;
    for (const { key, label } of ABILITY_SCORES) {
      const raw = draft.scores[key].trim();
      const value = raw === '' ? DEFAULT_SCORE : Number(raw);
      if (!Number.isInteger(value) || value < SCORE_MIN || value > SCORE_MAX) {
        return `${label} tiene que ser un entero entre ${SCORE_MIN} y ${SCORE_MAX}`;
      }
      scores[key] = value;
    }
    sheet.scores = scores;
  }

  const extra: Partial<Record<StatKey, number | string>> = {};
  for (const column of STAT_COLUMNS) {
    const raw = draft.extra[column.key].trim().replace(',', '.');
    if (!raw || raw === '0' || raw === '-') continue;
    const number = Number(raw);
    if (Number.isFinite(number)) {
      extra[column.key] = number;
      continue;
    }
    if (!/^[\d\s+\-.d]+$/i.test(raw) || raw.length > 20) {
      return `${column.label} tiene que ser un número o un dado (por ejemplo 1d4)`;
    }
    extra[column.key] = raw.replace(/\s+/g, '');
  }
  if (Object.keys(extra).length) sheet.extra = extra;
  return sheet;
}

const ScoreCard = ({ label, score }: { label: string; score: AbilityScore }) => (
  <div className="sheet-score">
    <div className="sheet-score__label">{label}</div>
    <div className="sheet-score__mod">{formatModifier(score.modifier)}</div>
    <div className="sheet-score__value">{score.score}</div>
  </div>
);

/** Panel de características de la ficha: muestra FUE…CAR y permite editar rol, puntuaciones y extra. */
const SheetEditor = ({ sheet, saving, error, onSave }: Props) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(sheet));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(toDraft(sheet));
  }, [sheet, editing]);

  const openEdit = () => {
    setDraft(toDraft(sheet));
    setLocalError(null);
    setEditing(true);
  };

  const save = async () => {
    if (saving) return;
    const next = fromDraft(draft, sheet?.skills);
    if (typeof next === 'string') {
      setLocalError(next);
      return;
    }
    setLocalError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // Players muestra el error de guardado.
    }
  };

  const roleName = sheet ? findRoleTable(sheet.roleId)?.name ?? sheet.roleId : null;
  const hasScores = ABILITY_SCORES.some(({ key }) => abilityScore(sheet, key));
  const shownError = localError ?? error;

  return (
    <section className="sheet-panel">
      <div className="sheet-sheet__head">
        <div className="sheet-panel__title">
          Características
          <span className="sheet-panel__meta">{roleName ? `Rol: ${roleName}` : 'Sin ficha'}</span>
        </div>
        {!editing && (
          <button
            type="button"
            className="sheet-hp__icon-btn"
            onClick={openEdit}
            disabled={saving}
            aria-label="Editar ficha"
            title="Editar ficha"
          >
            ✎
          </button>
        )}
      </div>

      {!editing && (
        hasScores ? (
          <div className="sheet-scores">
            {ABILITY_SCORES.map(({ key, label }) => {
              const score = abilityScore(sheet, key);
              return score && <ScoreCard key={key} label={label} score={score} />;
            })}
          </div>
        ) : (
          <p className="calc-build-empty">Sin características. Pulsa ✎ para rellenarlas.</p>
        )
      )}

      {editing && (
        <div className="sheet-sheet__edit">
          <label className="sheet-hp__field sheet-sheet__role">
            <span>Tabla de rol</span>
            <select
              className="sheet-hp__input"
              value={draft.roleId}
              disabled={saving}
              onChange={event => setDraft(current => ({ ...current, roleId: event.target.value }))}
            >
              {!findRoleTable(draft.roleId) && <option value={draft.roleId}>{draft.roleId}</option>}
              {ROLE_TABLES.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </label>

          <div className="sheet-sheet__subtitle">Puntuaciones (vacío = sin características)</div>
          <div className="sheet-sheet__grid sheet-sheet__grid--scores">
            {ABILITY_SCORES.map(({ key, label, short }) => (
              <label key={key} className="sheet-hp__field" title={label}>
                <span>{short}</span>
                <input
                  className="sheet-hp__input"
                  inputMode="numeric"
                  value={draft.scores[key]}
                  disabled={saving}
                  onChange={event => {
                    const value = event.target.value.replace(/[^\d]/g, '');
                    setDraft(current => ({ ...current, scores: { ...current.scores, [key]: value } }));
                  }}
                />
              </label>
            ))}
          </div>

          <div className="sheet-sheet__subtitle">Extra (se suma al total)</div>
          <div className="sheet-sheet__grid">
            {STAT_COLUMNS.map(column => (
              <label key={column.key} className="sheet-hp__field" title={column.title}>
                <span>{column.label}</span>
                <input
                  className="sheet-hp__input"
                  value={draft.extra[column.key]}
                  placeholder="0"
                  disabled={saving}
                  onChange={event => {
                    const value = event.target.value;
                    setDraft(current => ({ ...current, extra: { ...current.extra, [column.key]: value } }));
                  }}
                />
              </label>
            ))}
          </div>

          <div className="sheet-sheet__actions">
            <button type="button" className="sheet-hp__done" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="sheet-hp__done" onClick={save} disabled={saving}>
              {saving ? 'Guardando' : '✓ Guardar ficha'}
            </button>
          </div>
        </div>
      )}

      {shownError && <p className="sheet-hp__error">{shownError}</p>}
    </section>
  );
};

export default SheetEditor;
