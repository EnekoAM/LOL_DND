import { useEffect, useState } from 'react';
import type { PlayerSheet } from '../../data/players';
import { ROLE_TABLES } from '../../data/roles';
import { STAT_COLUMNS, type StatKey } from '../calculos/statLine';
import { cx } from '../../lib/cx';

type Props = {
  sheet: PlayerSheet | undefined;
  saving: boolean;
  canEdit: boolean;
  error: string | null;
  onSave: (sheet: PlayerSheet) => Promise<void>;
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

/** Stats extra en la pestaña Desglose, mismo estilo de filas que el resto del desglose. */
const ExtraStatsPanel = ({ sheet, saving, canEdit, error, onSave }: Props) => {
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
    const next = fromDraft(draft, sheet);
    if (typeof next === 'string') {
      setLocalError(next);
      return;
    }
    setLocalError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      /* Players muestra el error */
    }
  };

  const shownError = localError ?? error;
  const hasExtra = STAT_COLUMNS.some(column => {
    const value = sheet?.extra?.[column.key];
    return value !== undefined && value !== 0 && value !== '' && value !== '-';
  });

  return (
    <div className="calc-role sheet-extra-desglose">
      <div className="calc-role__bar">
        <div className="calc-role__toggle" style={{ cursor: 'default' }}>
          <span className="calc-role__chevron" aria-hidden="true">▾</span>
          Extra
          <span className="sheet-panel__meta">Se suma al total</span>
        </div>
        {canEdit && !editing && (
          <button
            type="button"
            className="sheet-hp__icon-btn"
            onClick={openEdit}
            disabled={saving}
            aria-label="Editar stats extra"
            title="Editar stats extra"
          >
            ✎
          </button>
        )}
      </div>

      {!editing && (
        hasExtra ? (
          <div className="calc-sheet sheet-extra-desglose__table">
            <table>
              <tbody>
                <tr className="calc-sheet__row calc-sheet__row--extra">
                  <th scope="row">Extra</th>
                  {STAT_COLUMNS.map(column => {
                    const value = sheet?.extra?.[column.key];
                    const empty = value === undefined || value === 0 || value === '' || value === '-';
                    return (
                      <td key={column.key} title={column.title}>
                        {empty ? '—' : String(value)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="calc-build-empty calc-role__note">
            {canEdit ? 'Sin stats extra. Pulsa ✎ para añadirlas.' : 'Sin stats extra.'}
          </p>
        )
      )}

      {editing && (
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
            <button type="button" className="sheet-hp__done" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="sheet-hp__done" onClick={() => { void save(); }} disabled={saving}>
              {saving ? 'Guardando' : '✓ Guardar extra'}
            </button>
          </div>
        </div>
      )}

      {shownError && <p className={cx('sheet-hp__error')}>{shownError}</p>}
    </div>
  );
};

export default ExtraStatsPanel;
