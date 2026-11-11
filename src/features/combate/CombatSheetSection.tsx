import type { CombatParticipant } from '../../data/combat';
import { participantChampion, participantNpc } from '../../data/combatSheet';
import { NPC_STATS } from '../../data/npcs';
import { championResourceBar } from '../../data/resources';
import { championDamageContext } from '../calculos/championDamage';
import { numericStat } from './combatAbilityUse';

type Props = {
  participant: CombatParticipant;
  isAdmin: boolean;
};

type StatCell = { label: string; value: string };

const show = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value * 100) / 100);
  if (typeof value === 'string' && value.trim()) return value;
  return '—';
};

/** Ficha compacta de la copia de este participante (campeón: todos; NPC: solo admin). */
export default function CombatSheetSection({ participant, isAdmin }: Props) {
  const own = !!participant.sheet;
  const note = own
    ? 'Copia propia de este participante: lo que cambie aquí no toca la ficha base.'
    : 'Sin copia todavía: se lee la ficha base.';

  if (participant.kind === 'champion') {
    const champion = participantChampion(participant);
    if (!champion) return null;
    const { stats, level } = championDamageContext(champion);
    const bar = championResourceBar(champion.resource, numericStat(stats.mana));
    const cells: StatCell[] = [
      { label: 'Nivel', value: String(level) },
      { label: 'Vida', value: show(stats.hp) },
      { label: bar?.label ?? 'Maná', value: show(bar?.max ?? stats.mana) },
      { label: 'AD', value: show(stats.ad) },
      { label: 'AP', value: show(stats.ap) },
      { label: 'CA', value: show(stats.ac) },
      { label: 'MR', value: show(stats.mr) },
      { label: 'Vel.', value: show(stats.spe) },
    ];
    const items = champion.equipamiento ?? [];
    return (
      <div className="combat-panel__section">
        <h3 className="combat-panel__label">Ficha{own ? ' (copia)' : ''}</h3>
        <p className="combat-sheet__meta">{[champion.role, champion.region].filter(Boolean).join(' · ')}</p>
        <StatGrid cells={cells} />
        {items.length > 0 && <p className="combat-sheet__items">Equipo: {items.join(', ')}</p>}
        <p className="combat-page__hint">{note}</p>
      </div>
    );
  }

  if (participant.kind === 'npc' && isAdmin) {
    const npc = participantNpc(participant);
    if (!npc) return null;
    const cells: StatCell[] = [
      { label: 'Nivel', value: show(npc.level) },
      ...NPC_STATS.map(stat => ({ label: stat.label, value: show(npc.stats?.[stat.key]) })),
    ];
    return (
      <div className="combat-panel__section">
        <h3 className="combat-panel__label">Ficha{own ? ' (copia)' : ''}</h3>
        <p className="combat-sheet__meta">{[npc.type].filter(Boolean).join(' · ')}</p>
        <StatGrid cells={cells} />
        {npc.abilities?.length > 0 && (
          <ul className="combat-sheet__abilities">
            {npc.abilities.map(ability => (
              <li key={ability.id}>
                <span className="combat-sheet__ability-name">
                  {ability.label ? `${ability.label} · ` : ''}{ability.name}
                </span>
                {ability.cost && <span className="combat-panel__badge" title="Coste">{ability.cost}</span>}
                {ability.description && <p className="combat-sheet__ability-desc">{ability.description}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="combat-page__hint">{note}</p>
      </div>
    );
  }

  return null;
}

function StatGrid({ cells }: { cells: StatCell[] }) {
  return (
    <dl className="combat-sheet__stats">
      {cells.map(cell => (
        <div key={cell.label} className="combat-sheet__stat">
          <dt>{cell.label}</dt>
          <dd>{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
