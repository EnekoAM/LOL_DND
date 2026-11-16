import { useState } from 'react';
import type { PlayerSheet } from '../../data/players';
import { ROLE_TABLES } from '../../data/roles';
import { STAT_COLUMNS, type StatKey } from '../calculos/statLine';

type Props = {
  sheet: PlayerSheet | undefined;
  saving: boolean;
  error: string | null;
  onSave: (sheet: PlayerSheet) => Promise<void>;
  onClose: () => void;
};

type Draft = Record<StatKey, string>;

function toDraft(sheet: PlayerSheet | undefined): Draft {
  const extra = {} as Draft;
  for (const column of STAT_COLUMNS) {
    const value = sheet?.extra?.[column.key];
    extra[column.key] = value === undefined || value === 0 ? '' : String(value);
  }
  return extra;
}

function fromDraft(draft: Draft, sheet: PlayerSheet | undefined): PlayerSheet | string {
  const next: PlayerSheet = { roleId: sheet?.roleId || ROLE_TABLES[0].id };
  if (sheet?.scores) next.scores = sheet.scores;
  if (sheet?.skills) next.skills = sheet.skills;

  const extra: NonNullable<PlayerSheet['extra']> = {};
  for (const column of STAT_COLUMNS) {
    const raw = draft[column.key].trim().replace(',', '.');
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
  if (Object.keys(extra).length) next.extra = extra;
  else delete next.extra;
  return next;
}

/** Editor de estadísticas adicionales (se abre con el lápiz de la fila en Desglose). */
const ExtraStatsPanel = ({ sheet, saving, error, onSave, onClose }: Props) => {
  const [draft, setDraft] = useState<Draft>(() => toDraft(sheet));
  const [localError, setLocalError] = useState<string | null>(null);

  const save = async () => {
    if (saving) return;
    const next = fromDraft(draft, sheet);
    if (typeof next === 'string') {
      setLocalError(next);
      return;
    }
    setLocalError(null);
    try {
      await onSave(next);
      onClose();
    } catch {
      /* Players muestra el error */
    }
  };

  const shownError = localError ?? error;

  return (
    <div className="sheet-sheet__edit sheet-extra-desglose__edit">
      <div className="sheet-sheet__grid">
        {STAT_COLUMNS.map(column => (
          <label key={column.key} className="sheet-hp__field" title={column.title}>
            <span>{column.label}</span>
            <input
              className="sheet-hp__input"
              value={draft[column.key]}
              placeholder="0"
              disabled={saving}
              onChange={event => {
                const value = event.target.value;
                setDraft(current => ({ ...current, [column.key]: value }));
              }}
            />
          </label>
        ))}
      </div>
      <div className="sheet-sheet__actions">
        <button type="button" className="sheet-hp__done" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
        <button type="button" className="sheet-hp__done" onClick={() => { void save(); }} disabled={saving}>
          {saving ? 'Guardando' : 'Guardar'}
        </button>
      </div>
      {shownError && <p className="sheet-hp__error">{shownError}</p>}
    </div>
  );
};

export default ExtraStatsPanel;
