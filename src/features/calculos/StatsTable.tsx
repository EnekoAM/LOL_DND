import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { findItem } from '../../data/items';
import { partyLevel, subscribeParty } from '../../data/party';
import { cx } from '../../lib/cx';
import {
  ABILITY_SCORES,
  abilityScore,
  sheetBase,
  sheetExtra,
  type AbilityScore,
  type PlayerSheet,
} from './playerSheets';
import { ROLE_TABLES, findRoleTable } from '../../data/roles';
import { playerTotalLine } from './playerTotals';
import type { AbilityPassiveSource } from '../players/abilityPassiveStats';
import type { PermanentStackStatSource } from '../../data/permanentStacks';
import {
  STAT_COLUMNS,
  formatDefenseStat,
  formatStat,
  formatStatBonus,
  isDefenseKey,
  isZeroStat,
  itemStatLine,
  type StatLine,
  type StatValue,
} from './statLine';

type Props = {
  playerName: string;
  /** Ficha del player (Mongo). Sin ficha, el total solo suma el equipamiento. */
  sheet?: PlayerSheet;
  equipment: string[];
  /** Si true, la ficha de estadísticas sale desplegada. */
  defaultOpen?: boolean;
  /** Nivel propio (fichas de campeón). Sin él se usa el nivel del grupo. */
  level?: number;
  /** Si true, la tabla de rol sale desplegada. */
  roleTableOpen?: boolean;
  /** Si true (fichas de players sin la quest de top), los niveles 19 y 20 salen oscurecidos con candado. */
  lockFutureLevels?: boolean;
  /** Si false, la tabla de rol sale fija en la clase del personaje (sin selector). */
  canPickRole?: boolean;
  /** Si true, la fila de estadísticas adicionales sale siempre, con un lápiz para editarla. */
  canEditExtra?: boolean;
  /** Editor de estadísticas adicionales; se muestra debajo de la tabla al pulsar el lápiz. */
  renderExtraEditor?: (close: () => void) => ReactNode;
  /** Pasivas de habilidades que dan stats (fichas de players): una fila cada una y suman al total. */
  abilityPassives?: AbilityPassiveSource[];
  /** Cargas permanentes de efectos de item (solo con el item equipado). */
  stackSources?: PermanentStackStatSource[];
};

const EXTRA_LABEL = 'Estad\u00edsticas adicionales';

type SheetRow = {
  key: string;
  label: string;
  line: StatLine | null;
  tone?: 'total' | 'base' | 'extra' | 'current' | 'passive';
  onClick?: () => void;
  passive?: string;
  active?: string;
  /** Nivel aún no alcanzado: fila oscurecida bajo el candado. */
  locked?: boolean;
  /** Botón a la derecha de la etiqueta (p. ej. editar). */
  action?: ReactNode;
};

/** Niveles bloqueados por quests en fichas de players (19 y 20). */
const QUEST_LOCK_FROM = 19;

const LockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Zm3 3.5a1.75 1.75 0 0 1 1 3.19V19h-2v-2.31a1.75 1.75 0 0 1 1-3.19Z"
    />
  </svg>
);

type LockArea = { top: number; height: number; width: number };

/** Posición del bloque de filas bloqueadas dentro del scroll de la tabla. */
function useLockArea(
  scrollRef: RefObject<HTMLDivElement | null>,
  tableRef: RefObject<HTMLTableElement | null>,
  deps: unknown[],
) {
  const [area, setArea] = useState<LockArea | null>(null);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const table = tableRef.current;
    if (!scroll || !table) return undefined;
    const measure = () => {
      const first = table.querySelector<HTMLTableRowElement>('tr.calc-sheet__row--locked');
      if (!first) {
        setArea(null);
        return;
      }
      const box = scroll.getBoundingClientRect();
      const row = first.getBoundingClientRect();
      const bottom = table.getBoundingClientRect().bottom;
      setArea({ top: row.top - box.top + scroll.scrollTop, height: bottom - row.top, width: table.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return area;
}

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

const StatCells = ({ line, roundDefenses = false }: { line: StatLine | null; roundDefenses?: boolean }) => (
  <>
    {STAT_COLUMNS.map(column => {
      const value: StatValue | null = line ? line[column.key] : null;
      if (value === null) {
        return <td key={column.key}>—</td>;
      }
      const defense = roundDefenses && isDefenseKey(column.key) ? formatDefenseStat(value) : null;
      const shown = defense ? defense.text : formatStat(value);
      const zeroValue = defense ? Number(defense.text.replace(',', '.')) : value;
      return (
        <td
          key={column.key}
          className={cx(isZeroStat(typeof zeroValue === 'number' ? zeroValue : value) && 'calc-sheet__zero')}
          title={defense?.exactTitle}
        >
          {shown}
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

const SheetGrid = ({ rows, effects, className }: { rows: SheetRow[]; effects: boolean; className?: string }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const lockedRows = rows.filter(row => row.locked);
  const lockKey = lockedRows.map(row => row.key).join(',');
  const lockArea = useLockArea(scrollRef, tableRef, [lockKey, rows.length]);
  const firstLocked = lockedRows[0]?.label;

  return (
    <div ref={scrollRef} className={cx('calc-sheet-scroll', lockedRows.length > 0 && 'calc-sheet-scroll--locks', className)}>
      <table ref={tableRef} className="calc-sheet">
        <thead>
          <tr>
            <th>Origen</th>
            {STAT_COLUMNS.map(column => (
              <th key={column.key} title={column.title}>{column.label}</th>
            ))}
            {effects && (
              <>
                <th title={'Descripci\u00f3n del \u00edtem o bonus pasivo de la habilidad (pasa el rat\u00f3n por \u00abS\u00ed\u00bb)'}>INFO</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.key}
              className={cx(row.tone && `calc-sheet__row--${row.tone}`, row.locked && 'calc-sheet__row--locked')}
              aria-disabled={row.locked || undefined}
            >
              <th scope="row">
                {row.locked && <LockIcon className="calc-sheet__lock-mini" />}
                {row.onClick ? (
                  <button type="button" className="calc-sheet__label-btn" title={row.label} onClick={row.onClick}>
                    {row.label}
                  </button>
                ) : row.label}
                {row.action}
              </th>
              <StatCells line={row.line} roundDefenses={row.tone === 'total'} />
              {effects && (
                <>
                  <EffectCell text={row.passive} />
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {lockArea && (
        <div
          className="calc-sheet__lock"
          style={{ top: lockArea.top, height: lockArea.height, width: lockArea.width }}
          aria-hidden="true"
        >
          <div className="calc-sheet__lock-badge">
            <LockIcon className="calc-sheet__lock-icon" />
            <span className="calc-sheet__lock-title">Bloqueado</span>
            {firstLocked && (
              <span className="calc-sheet__lock-sub">
                {lockedRows.length === 1 ? firstLocked : `${firstLocked} – ${lockedRows[lockedRows.length - 1].label}`}
                {' · Completar la quest de top para desbloquear'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const RoleTablePanel = ({
  roleId,
  level,
  defaultOpen = false,
  lockLevel,
  canPick = true,
}: {
  roleId: string;
  /** Si false, sin selector: sale la tabla de la clase del personaje. */
  canPick?: boolean;
  level?: number;
  defaultOpen?: boolean;
  /** Niveles por encima de este salen bloqueados (candado). */
  lockLevel?: number;
}) => {
  const [open, setOpen] = useState(defaultOpen);
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
        {canPick ? (
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
        ) : (
          <span className="sheet-panel__meta">{role.name}</span>
        )}
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
              locked: lockLevel !== undefined && rowLevel > lockLevel,
            };
          })}
        />
      )}
    </div>
  );
};

const StatsTable = ({
  playerName,
  sheet,
  equipment,
  defaultOpen = false,
  level: levelOverride,
  roleTableOpen = false,
  lockFutureLevels = false,
  canPickRole = true,
  canEditExtra = false,
  renderExtraEditor,
  abilityPassives = [],
  stackSources = [],
}: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  const [editingExtra, setEditingExtra] = useState(false);
  const extraEditable = canEditExtra && Boolean(renderExtraEditor);
  const partyLevelNow = useSyncExternalStore(subscribeParty, partyLevel);
  const level = sheet ? (levelOverride ?? partyLevelNow) : undefined;
  const base = sheet ? sheetBase(sheet, level) : undefined;
  const extra = sheetExtra(sheet);

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
      // Los textos antiguos de pasiva / activa ya no se ensenan: solo la descripcion del item.
      passive: item?.description ?? '',
    };
  });

  const passiveRows: SheetRow[] = abilityPassives.map(source => ({
    key: `passive-${source.seal}-${source.name}`,
    label: `Pasiva: ${source.name} (${source.seal})`,
    line: source.line,
    tone: 'passive' as const,
    passive: `Bonus pasivo de la habilidad: ${source.bonuses.map(bonus => `${formatStatBonus(bonus.stat, bonus.amount)} (${bonus.reason})`).join(' · ')}`,
    active: '-',
  }));

  const stackRows: SheetRow[] = stackSources.map(source => ({
    key: `stack-${source.key}`,
    label: source.name,
    line: source.line,
    tone: 'passive' as const,
    passive: `${source.stacks} cargas permanentes (solo con el item equipado)`,
    active: '-',
  }));

  // Las pasivas cuentan como bonus (igual que los ítems).
  const total = playerTotalLine(sheet, equipment, level, [
    ...abilityPassives.map(source => source.line),
    ...stackSources.map(source => source.line),
  ]);

  const rows: SheetRow[] = [
    { key: 'total', label: 'Total', line: total, tone: 'total' },
    ...(base ? [{ key: 'base', label: `Base nv. ${level}`, line: base, tone: 'base' as const }] : []),
    ...itemRows,
    ...passiveRows,
    ...stackRows,
    ...(extra || extraEditable
      ? [{
          key: 'extra',
          label: EXTRA_LABEL,
          line: extra ?? null,
          tone: 'extra' as const,
          passive: '-',
          active: '-',
          action: extraEditable && !editingExtra ? (
            <button
              type="button"
              className="sheet-hp__icon-btn calc-sheet__row-edit"
              onClick={() => setEditingExtra(true)}
              aria-label={'Editar ' + EXTRA_LABEL.toLowerCase()}
              title={'Editar ' + EXTRA_LABEL.toLowerCase()}
            >
              {'\u270E'}
            </button>
          ) : undefined,
        }]
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
            {editingExtra && renderExtraEditor?.(() => setEditingExtra(false))}
            {sheet?.scores && (
              <div className="calc-scores calc-scores--sheet">
                {ABILITY_SCORES.map(({ key, label }) => {
                  const score = abilityScore(sheet, key);
                  return score && <Score key={key} label={label} score={score} />;
                })}
              </div>
            )}
          </>
        )}
      </div>

      <RoleTablePanel
        key={`${playerName}-${sheet?.roleId ?? ''}`}
        roleId={sheet?.roleId ?? ROLE_TABLES[0].id}
        level={level}
        defaultOpen={roleTableOpen}
        canPick={canPickRole}
        lockLevel={lockFutureLevels ? QUEST_LOCK_FROM - 1 : undefined}
      />
    </>
  );
};

export default StatsTable;
