import { useMemo } from 'react';
import {
  CHAMPION_REGIONS,
  CHAMPION_ROLES,
  CHAMPIONS,
  filterChampions,
  type Champion,
  type ChampionFilter,
} from '../../data/champions';
import { useLiveRevision } from '../../data/live';
import { cx } from '../../lib/cx';
import PickerCard from './PickerCard';

export type ChampionPickerFilter = ChampionFilter & { onlyFavorites: boolean };

type Props = {
  filter: ChampionPickerFilter;
  onFilterChange: (patch: Partial<ChampionPickerFilter>) => void;
  favorites: Set<string>;
  onToggleFavorite: (championName: string) => void;
  onSelect: (champion: Champion) => void;
};

const ChampionPicker = ({ filter, onFilterChange, favorites, onToggleFavorite, onSelect }: Props) => {
  const liveRevision = useLiveRevision('champions');
  const champions = useMemo(
    () => filterChampions(CHAMPIONS, filter).filter(c => !filter.onlyFavorites || favorites.has(c.champion)),
    [filter, favorites, liveRevision],
  );
  const pinned = useMemo(() => CHAMPIONS.filter(c => favorites.has(c.champion)), [favorites, liveRevision]);

  return (
    <>
      <div className="calc-champ-filters">
        <input
          className="calc-input calc-champ-search"
          type="text"
          placeholder="Buscar campeón..."
          value={filter.search}
          onChange={e => onFilterChange({ search: e.target.value })}
        />
        <select
          className="calc-select-dmg"
          value={filter.region}
          onChange={e => onFilterChange({ region: e.target.value })}
        >
          <option value="">Región</option>
          {CHAMPION_REGIONS.map(region => (
            <option key={region} value={region}>{region}</option>
          ))}
        </select>
        <select
          className="calc-select-dmg"
          value={filter.role}
          onChange={e => onFilterChange({ role: e.target.value })}
        >
          <option value="">Rol</option>
          {CHAMPION_ROLES.map(role => (
            <option key={role} value={role}>{role}</option>
          ))}
        </select>
        <button
          className={cx('calc-fav-toggle', filter.onlyFavorites && 'calc-fav-toggle--active')}
          onClick={() => onFilterChange({ onlyFavorites: !filter.onlyFavorites })}
          title="Mostrar solo favoritos"
        >☆</button>
      </div>

      {pinned.length > 0 && !filter.onlyFavorites && (
        <div className="calc-pinned">
          <div className="calc-pinned__label">★ Favoritos</div>
          <div className="calc-pinned__chips">
            {pinned.map(champion => (
              <button key={champion.champion} className="calc-pinned__chip" onClick={() => onSelect(champion)}>
                {champion.image
                  ? <img src={champion.image} alt={champion.champion} className="calc-pinned__chip-img" />
                  : <span className="calc-pinned__chip-letter">{champion.champion.charAt(0)}</span>
                }
                <span>{champion.champion}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="calc-grid">
        {champions.map(champion => (
          <PickerCard key={champion.champion} name={champion.champion} onClick={() => onSelect(champion)}>
            <button
              className={cx('calc-star', favorites.has(champion.champion) && 'calc-star--active')}
              onClick={e => {
                e.stopPropagation();
                onToggleFavorite(champion.champion);
              }}
            >★</button>
          </PickerCard>
        ))}
      </div>
    </>
  );
};

export default ChampionPicker;
