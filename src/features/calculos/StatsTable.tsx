import { useState, useSyncExternalStore } from 'react';
import { findItem } from '../../data/items';
import { partyLevel, subscribeParty } from '../../data/party';
import { cx } from '../../lib/cx';
import {
  ABILITY_SCORES,
  findPlayerSheet,
  sheetBase,
  type AbilityScore,
} from './playerSheets';
import { ROLE_TABLES, findRoleTable } from './roleTables';
import {
  STAT_COLUMNS,
  emptyStatLine,
  formatStat,
  isZeroStat,
  itemStatLine,
  sumStatLines,
  type StatLine,
  type StatValue,
} from './statLine';

type Props = {
  playerName: string;
  equipment: string[];
};

type SheetRow = {
  key: string;
  label: string;
  line: StatLine | null;
  tone?: 'total' | 'base' | 'extra' | 'current';
  onClick?: () => void;
  passive?: string;
  active?: string;
};

const hasEffect = (text: string | undefined): boolean => {
  const value = text?.trim();
  return Boolean(value && value !== '-');
};

const formatModifier = (modifier: number): string =>
  modifier >= 0 ? `(+${modifier})` : `(${modifier})`;

const Score = ({ label, score }: { label: string; score: AbilityScore }) => (
  <div className="calc-score">
    <div className="calc-score__label">{label}</div>
    <div className="calc-score__value">
      {score.score}
      <span className="calc-score__mod">{formatModifier(score.modifier)}</span>
    </div>
  </div>
);

const StatCells = ({ line }: { line: StatLine | null }) => (
  <>
    {STAT_COLUMNS.map(column => {
      const value: StatValue | null = line ? line[column.key] : null;
      return (
        <td key={column.key} className={cx(value !== null && isZeroStat(value) && 'calc-sheet__zero')}>
          {value === null ? '—' : formatStat(value)}
        </td>
      );
    })}
  </>
);

const EffectCell = ({ text }: { text: string | undefined }) => {
  if (text === undefined) return <td />;
  if (!hasEffect(text)) return <td className="calc-sheet__zero">—</td>;
  return <td className="calc-sheet__effect" title={text}>Sí</td>;
};

const SheetGrid = ({ rows, effects, className }: { rows: SheetRow[]; effects: boolean; className?: string }) => (
  <div className={cx('calc-sheet-scroll', className)}>
    <table className="calc-sheet">
      <thead>
        <tr>
          <th>Origen</th>
          {STAT_COLUMNS.map(column => (
            <th key={column.key} title={column.title}>{column.label}</th>
          ))}
          {effects && (
            <>
              <th>PASIVA</th>
              <th>ACTIVA</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.key} className={cx(row.tone && `calc-sheet__row--${row.tone}`)}>
            <th scope="row">
              {row.onClick ? (
                <button type="button" className="calc-sheet__label-btn" title={row.label} onClick={row.onClick}>
                  {row.label}
                </button>
              ) : row.label}
            </th>
            <StatCells line={row.line} />
            {effects && (
              <>
                <EffectCell text={row.passive} />
                <EffectCell text={row.active} />
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const RoleTablePanel = ({ roleId, level }: { roleId: string; level?: number }) => {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(roleId);
  const role = findRoleTable(selectedId) ?? ROLE_TABLES[0];

  return (
    <div className="calc-role">
      <div className="calc-role__bar">
        <button
          type="button"
          className="calc-role__toggle"
          aria-expanded={open}
          onClick={() => setOpen(current => !current)}
        >
          <span className="calc-role__chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
          Tabla de rol
        </button>
        <select
          className="calc-select-dmg"
          aria-label="Rol"
          value={role.id}
          onChange={event => setSelectedId(event.target.value)}
        >
          {ROLE_TABLES.map(option => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </div>
      {open && (
        <SheetGrid
          effects={false}
          rows={role.levels.map((line, index) => {
            const rowLevel = index + 1;
            return {
              key: `lvl-${rowLevel}`,
              label: `Nv. ${rowLevel}`,
              line,
              tone: rowLevel === level && selectedId === roleId ? 'current' : undefined,
            };
          })}
        />
      )}
    </div>
  );
};

const StatsTable = ({ playerName, equipment }: Props) => {
  const [open, setOpen] = useState(false);
  const partyLevelNow = useSyncExternalStore(subscribeParty, partyLevel);
  const sheet = findPlayerSheet(playerName);
  const base = sheet ? sheetBase(sheet) : undefined;

  if (!sheet && equipment.length === 0) {
    return (
      <>
        <div className="calc-section-title">Estadísticas</div>
        <p className="calc-build-empty">Sin estadísticas ni equipamiento.</p>
      </>
    );
  }

  const itemRows: SheetRow[] = equipment.map((name, index) => {
    const item = findItem(name);
    return {
      key: `${name}-${index}`,
      label: item?.nombre ?? name,
      line: item ? itemStatLine(item.stats) : null,
      passive: item?.efecto.pasiva ?? '',
      active: item?.efecto.activa ?? '',
    };
  });

  const level = sheet ? partyLevelNow : undefined;
  const parts: StatLine[] = [];
  if (base) parts.push(base);
  for (const row of itemRows) parts.push(row.line ?? emptyStatLine());
  if (sheet?.extra) parts.push(sheet.extra);
  const total = sumStatLines(parts);

  const rows: SheetRow[] = [
    { key: 'total', label: 'Total', line: total, tone: 'total' },
    ...(base ? [{ key: 'base', label: `Base nv. ${level}`, line: base, tone: 'base' as const }] : []),
    ...itemRows,
    ...(sheet?.extra
      ? [{ key: 'extra', label: 'Extra', line: sheet.extra, tone: 'extra' as const, passive: '-', active: '-' }]
      : []),
  ];

  return (
    <>
      <div className="calc-role">
        <div className="calc-role__bar">
          <button
            type="button"
            className="calc-role__toggle"
            aria-expanded={open}
            onClick={() => setOpen(current => !current)}
          >
            <span className="calc-role__chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
            Estadísticas
          </button>
        </div>
        {open && (
          <>
            {!sheet && (
              <p className="calc-build-empty calc-role__note">Sin ficha de base. El total solo suma el equipamiento.</p>
            )}
            <SheetGrid rows={rows} effects />
            {sheet?.scores && (
              <div className="calc-scores calc-scores--sheet">
                {ABILITY_SCORES.map(({ key, label }) => (
                  <Score key={key} label={label} score={sheet.scores![key]} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <RoleTablePanel
        key={playerName}
        roleId={sheet?.roleId ?? ROLE_TABLES[0].id}
        level={level}
      />
    </>
  );
};

export default StatsTable;
