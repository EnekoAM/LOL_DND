import { useMemo, useState } from 'react';
import {
  CHAMPION_REGIONS,
  CHAMPION_ROLES,
  CHAMPIONS,
  filterChampions,
  type AbilityKey,
  type ChampionFilter,
} from '../../data/champions';
import { normalizeName } from '../../lib/text';
import AbilityModal from './AbilityModal';
import ChampionRow from './ChampionRow';
import PlayerLoadouts from './PlayerLoadouts';
import { ROLE_ICONS } from './championStyle';
import './Habilidades.css';

const Habilidades = () => {
  const [filter, setFilter] = useState<ChampionFilter>({ search: '', region: '', role: '' });
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ champion: string; slot: AbilityKey } | null>(null);
  const [revision, setRevision] = useState(0);

  const champions = useMemo(() => filterChampions(CHAMPIONS, filter), [filter, revision]);
  const selectedChampion = selected
    ? champions.find(champion => normalizeName(champion.champion) === normalizeName(selected.champion))
      ?? CHAMPIONS.find(champion => normalizeName(champion.champion) === normalizeName(selected.champion))
    : null;

  const updateFilter = (patch: Partial<ChampionFilter>) => setFilter(prev => ({ ...prev, ...patch }));
  const toggleChampion = (name: string) => setExpandedName(current => (current === name ? null : name));

  return (
    <div className="hab-root">
      <h2 className="hab-block-title">Jugadores</h2>
      <PlayerLoadouts revision={revision} />

      <h2 className="hab-block-title">Campeones</h2>
      <div className="hab-search-wrap">
        <span className="hab-search__icon">⚔</span>
        <input
          className="hab-search"
          type="text"
          placeholder="Buscar campeón..."
          value={filter.search}
          onChange={e => updateFilter({ search: e.target.value })}
        />
        <select className="hab-select" value={filter.region} onChange={e => updateFilter({ region: e.target.value })}>
          <option value="">Región</option>
          {CHAMPION_REGIONS.map(region => (
            <option key={region} value={region}>{region}</option>
          ))}
        </select>
        <select className="hab-select" value={filter.role} onChange={e => updateFilter({ role: e.target.value })}>
          <option value="">Rol</option>
          {CHAMPION_ROLES.map(role => (
            <option key={role} value={role}>{ROLE_ICONS[role]} {role}</option>
          ))}
        </select>
        <span className="hab-search__count">{champions.length}</span>
      </div>

      <div className="hab-list">
        {champions.map(champion => (
          <ChampionRow
            key={champion.champion}
            champion={champion}
            isOpen={expandedName === champion.champion}
            onToggle={toggleChampion}
            onOpenAbility={slot => setSelected({ champion: champion.champion, slot })}
          />
        ))}

        {champions.length === 0 && (
          <div className="hab-empty">
            <span className="hab-empty__icon">✦</span>
            <p>Ningún campeón encontrado</p>
          </div>
        )}
      </div>

      {selected && selectedChampion && (
        <AbilityModal
          champion={selectedChampion}
          slot={selected.slot}
          onClose={() => setSelected(null)}
          onSaved={() => setRevision(current => current + 1)}
        />
      )}
    </div>
  );
};

export default Habilidades;
