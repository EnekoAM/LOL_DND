import { useMemo } from 'react';
import {
  ABILITY_KEYS,
  CHAMPION_REGIONS,
  CHAMPION_ROLES,
  CHAMPIONS,
  filterChampions,
  type Champion,
  type ChampionFilter,
} from '../../data/champions';
import { useCanEdit } from '../../data/appRoleContext';
import { useLiveRevision } from '../../data/live';
import { cssVars } from '../../lib/cssVars';
import { cx } from '../../lib/cx';
import { ROLE_ICONS, regionColor } from '../habilidades/championStyle';
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
  const canEdit = useCanEdit();
  const liveRevision = useLiveRevision('champions');
  // Players solo ven campeones activos: el filtro se fuerza aquí y no pueden quitarlo.
  const onlyActive = canEdit ? !!filter.onlyActive : true;
  const visible = useMemo(
    () => (canEdit ? CHAMPIONS : CHAMPIONS.filter(c => c.active === true)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, liveRevision],
  );
  const champions = useMemo(
    () => filterChampions(visible, { ...filter, onlyActive }).filter(c => !filter.onlyFavorites || favorites.has(c.champion)),
    [visible, filter, onlyActive, favorites],
  );
  const pinned = useMemo(() => visible.filter(c => favorites.has(c.champion)), [visible, favorites]);

  return (
    <>
      <div className="calc-champ-filters">
        <span className="search-clear-wrap">
          <input
            className="calc-input calc-champ-search"
            type="text"
            placeholder="Buscar campeón..."
            value={filter.search}
            onChange={e => onFilterChange({ search: e.target.value })}
          />
          {filter.search && (
            <button type="button" className="search-clear" aria-label="Borrar búsqueda" title="Borrar" onClick={() => onFilterChange({ search: '' })}>×</button>
          )}
        </span>
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
            <option key={role} value={role}>{ROLE_ICONS[role] ?? ''} {role}</option>
          ))}
        </select>
        {canEdit && (
          <button
            type="button"
            className={cx('calc-learned-toggle', onlyActive && 'calc-learned-toggle--on')}
            aria-pressed={onlyActive}
            title="Solo campeones activos (visibles para players)"
            onClick={() => onFilterChange({ onlyActive: !onlyActive })}
          >
            Activos
          </button>
        )}
        <button
          type="button"
          className={cx('calc-learned-toggle', filter.onlyLearned && 'calc-learned-toggle--on')}
          aria-pressed={!!filter.onlyLearned}
          title="Solo con habilidades aprendidas"
          onClick={() => onFilterChange({ onlyLearned: !filter.onlyLearned })}
        >
          Aprendidas
        </button>
        <button
          type="button"
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
              <button key={champion.champion} type="button" className="calc-pinned__chip" onClick={() => onSelect(champion)}>
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
          <PickerCard key={champion.champion} name={champion.champion} className="calc-card--champ" onClick={() => onSelect(champion)}>
            <div
              className="calc-champ-card"
              style={cssVars({ '--champ-color': regionColor(champion.region) })}
            >
              <button
                type="button"
                className={cx('calc-star', favorites.has(champion.champion) && 'calc-star--active')}
                onClick={e => {
                  e.stopPropagation();
                  onToggleFavorite(champion.champion);
                }}
                title={favorites.has(champion.champion) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
              >★</button>
              <div className="calc-champ-card__portrait">
                {champion.image
                  ? <img src={champion.image} alt="" />
                  : <span aria-hidden="true">{champion.champion.charAt(0)}</span>}
              </div>
              {canEdit && champion.active && <div className="calc-champ-card__active">Activo</div>}
              <div className="calc-champ-card__meta">
                <span className="calc-champ-card__region">{champion.region}</span>
                <span className="calc-champ-card__role">
                  {ROLE_ICONS[champion.role] ?? ''} {champion.role}
                </span>
              </div>
              <div className="calc-champ-card__keys" aria-label="Habilidades">
                {ABILITY_KEYS.map(key => {
                  const ability = champion.abilities[key];
                  return (
                    <span
                      key={key}
                      className={cx(
                        'calc-champ-pip',
                        !!ability && 'calc-champ-pip--active',
                        ability?.learned && 'calc-champ-pip--learned',
                      )}
                      title={
                        ability?.learned
                          ? `${key}: aprendida`
                          : ability
                            ? `${key}: definida`
                            : `${key}: vacía`
                      }
                    >
                      {key}
                    </span>
                  );
                })}
              </div>
            </div>
          </PickerCard>
        ))}
      </div>

      {champions.length === 0 && (
        <div className="calc-champ-empty">
          <span aria-hidden="true">✦</span>
          <p>Ningún campeón encontrado</p>
        </div>
      )}
    </>
  );
};

export default ChampionPicker;
