import React, { useState } from 'react';
import playersData from '../json/players.json';
import habilidadesData from '../json/habilidades.json';
import ItemsData from '../json/items.json';
import './Calculos.css';

/* ================= TIPOS ================= */

type DamageType = {
  ap?: number[];
  ad?: number[];
  singleTargetMultiplier?: number;
};

type AbilityData = {
  name: string;
  description?: string;
  damage?: DamageType;
};

type SelectedAbility = {
  playerName: string;
  abilityKey: string;
  ability: AbilityData;
};

/* ================= UTILS ================= */

const abilityOrder = [
  { key: 'P',  label: 'Pasiva'      },
  { key: 'H1', label: 'Habilidad 1' },
  { key: 'H2', label: 'Habilidad 2' },
  { key: 'H3', label: 'Habilidad 3' },
  { key: 'R',  label: 'Definitiva'  },
];

const findAbility = (name: string | null): AbilityData | null => {
  if (!name) return null;
  for (const champ of habilidadesData as any[]) {
    for (const ability of Object.values(champ.abilities) as any[]) {
      if (ability.name === name) return ability as AbilityData;
    }
  }
  return null;
};

const getCraftTree = (item: typeof ItemsData[0]) => {
  const fromItems = item.craftsFrom
    .map(name => ItemsData.find(i => i.nombre.toLowerCase().trim() === name.toLowerCase().trim()))
    .filter(Boolean) as typeof ItemsData;
  const toItems = item.craftsTo
    .map(name => ItemsData.find(i => i.nombre.toLowerCase().trim() === name.toLowerCase().trim()))
    .filter(Boolean) as typeof ItemsData;
  return { fromItems, toItems };
};

/* ================= COMPONENTE ================= */

const Calculos = () => {
  const [selectedPlayer,    setSelectedPlayer]    = useState<any>(null);
  const [selectedAbility,   setSelectedAbility]   = useState<SelectedAbility | null>(null);
  const [selectedChampion,  setSelectedChampion]  = useState<any>(null);
  const [champSearch,       setChampSearch]        = useState('');
  const [champRegion,       setChampRegion]        = useState('');
  const [champRole,         setChampRole]          = useState('');
  const [onlyFav,           setOnlyFav]            = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('calc-champ-favorites');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const toggleFav = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      try { localStorage.setItem('calc-champ-favorites', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const ALL_CHAMP_REGIONS = Array.from(new Set((habilidadesData as any[]).map(c => c.region).filter(Boolean))).sort() as string[];
  const ALL_CHAMP_ROLES   = ['Luchador', 'Mago', 'Tirador', 'Tanque', 'Asesino', 'Soporte'];
  const [selectedCraftItem, setSelectedCraftItem] = useState<typeof ItemsData[0] | null>(null);
  const [ap,                setAp]                = useState(0);
  const [nivel,             setNivel]             = useState(1);
  const [objetivoUnico,     setObjetivoUnico]     = useState(false);

  /* ── CALCULOS ── */
  const apScaling             = selectedAbility?.ability.damage?.ap?.[nivel - 1] ?? 0;
  const dañoBase              = ap * apScaling;
  const singleTargetMultiplier = selectedAbility?.ability.damage?.singleTargetMultiplier ?? 1;
  const dañoFinal             = objetivoUnico ? dañoBase * singleTargetMultiplier : dañoBase;

  const getItemState = (itemName: string) => {
    const itemJson = ItemsData.find(i => i.nombre.toLowerCase().trim() === itemName.toLowerCase().trim());
    const cantidad = itemJson?.cantidad ?? 0;
    const equipped = selectedPlayer?.equipamiento.some(
      (eq: string) => eq.toLowerCase().trim() === itemName.toLowerCase().trim()
    );
    if (equipped) return 'equipped';
    if (cantidad > 0) return 'owned';
    return 'none';
  };

  /* ── RENDER ── */
  return (
    <div className="calc-root">

      {/* ════════════════════════════════════
          CALCULADORA POR PLAYER
      ════════════════════════════════════ */}
      {!selectedAbility && (
        <>
          <div className="calc-section-title">Calculadora por Player</div>

          {/* SELECT PLAYER */}
          {!selectedPlayer && (
            <div className="calc-grid">
              {playersData.map((player: any) => (
                <div
                  key={player.name}
                  className="calc-card calc-card--player"
                  onClick={() => setSelectedPlayer(player)}
                >
                  <div className="calc-card__name calc-card__name--player">{player.name}</div>
                </div>
              ))}
            </div>
          )}

          {/* PLAYER SELECCIONADO */}
          {selectedPlayer && (
            <>
              <button className="calc-back-btn" onClick={() => setSelectedPlayer(null)}>
                ← Cambiar player
              </button>

              <div className="calc-selected-header">
                <div className="calc-selected-header__name">{selectedPlayer.name}</div>
              </div>

              {selectedPlayer.basicAttack && (
                <div className="calc-basic-attack">
                  <strong>Ataque básico</strong>
                  {selectedPlayer.basicAttack.scaling
                    .map((v: number) => `${Math.round(v * 100)}%`)
                    .join(' / ')}{' '}AP
                </div>
              )}

              {/* HABILIDADES */}
              <div className="calc-grid">
                {abilityOrder.map(({ key, label }) => {
                  const abilityName = selectedPlayer.abilities[key];
                  const abilityData = findAbility(abilityName);
                  const hasCalc     = !!abilityData?.damage;

                  return (
                    <div
                      key={key}
                      className={`calc-card calc-card--ability ${!hasCalc ? 'calc-card--ability--inactive' : ''}`}
                      onClick={() =>
                        hasCalc &&
                        setSelectedAbility({
                          playerName: selectedPlayer.name,
                          abilityKey: key,
                          ability: abilityData!,
                        })
                      }
                    >
                      <div className="calc-card__key">[{label}]</div>
                      <div className="calc-card__name">{abilityName ?? 'No definida'}</div>
                      {abilityData?.damage?.ap && (
                        <div className="calc-card__damage">
                          AP: {abilityData.damage.ap.map(v => `${Math.round(v * 100)}%`).join(' / ')}
                        </div>
                      )}
                      {!abilityData && <div className="calc-card__undefined">No implementada</div>}
                      {abilityData && !abilityData.damage && <div className="calc-card__no-calc">Sin cálculo</div>}
                    </div>
                  );
                })}
              </div>

              {/* ── EQUIPAMIENTO ACTUAL ── */}
              <div className="calc-section-title" style={{ marginTop: '32px' }}>Equipamiento actual</div>
              <div className="calc-equip-grid">
                {selectedPlayer.equipamiento.map((itemName: string, index: number) => {
                  const itemData = ItemsData.find(
                    i => i.nombre.toLowerCase().trim() === itemName.toLowerCase().trim()
                  );
                  return (
                    <div
                      key={index}
                      className="calc-item-card"
                      onClick={() => itemData && setSelectedCraftItem(itemData)}
                    >
                      {itemData?.imagen
                        ? <img className="calc-item-card__img" src={itemData.imagen} alt={itemName} />
                        : <div className="calc-item-card__no-img">✦</div>
                      }
                      <div className="calc-item-card__name" title={itemName}>{itemName}</div>
                    </div>
                  );
                })}
              </div>

              {/* ── BUILD DESEADA ── */}
              <div className="calc-section-title">Build deseada</div>
              <div className="calc-build-grid">
                {selectedPlayer.build.map((itemName: string, index: number) => {
                  const itemData = ItemsData.find(
                    i => i.nombre.toLowerCase().trim() === itemName.toLowerCase().trim()
                  );
                  const state = getItemState(itemName);

                  return (
                    <div
                      key={index}
                      className={`calc-item-card calc-item-card--${state}`}
                      onClick={() => itemData && setSelectedCraftItem(itemData)}
                    >
                      {itemData?.imagen
                        ? <img className="calc-item-card__img" src={itemData.imagen} alt={itemName} />
                        : <div className="calc-item-card__no-img">✦</div>
                      }
                      <div className="calc-item-card__name" title={itemName}>{itemName}</div>

                      {state === 'equipped' && (
                        <div className="calc-item-card__badge calc-item-card__badge--check">✓</div>
                      )}
                      {state === 'owned' && (
                        <div className="calc-item-card__badge">🎒</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════
          CALCULADORA POR CAMPEÓN (DM)
      ════════════════════════════════════ */}
      {!selectedAbility && (
        <>
          <div className="calc-divider" />
          <div className="calc-section-title">Calculadora por Campeón (DM)</div>

          {!selectedChampion && (
            <>
              <div className="calc-champ-filters">
                <input
                  className="calc-input calc-champ-search"
                  type="text"
                  placeholder="Buscar campeón..."
                  value={champSearch}
                  onChange={e => setChampSearch(e.target.value)}
                />
                <select
                  className="calc-select-dmg"
                  value={champRegion}
                  onChange={e => setChampRegion(e.target.value)}
                >
                  <option value="">Región</option>
                  {ALL_CHAMP_REGIONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <select
                  className="calc-select-dmg"
                  value={champRole}
                  onChange={e => setChampRole(e.target.value)}
                >
                  <option value="">Rol</option>
                  {ALL_CHAMP_ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  className={`calc-fav-toggle ${onlyFav ? 'calc-fav-toggle--active' : ''}`}
                  onClick={() => setOnlyFav(v => !v)}
                  title="Mostrar solo favoritos"
                >☆</button>
              </div>

              {/* ── PINNED CHIPS ── */}
              {favorites.size > 0 && !onlyFav && (
                <div className="calc-pinned">
                  <div className="calc-pinned__label">★ Favoritos</div>
                  <div className="calc-pinned__chips">
                    {habilidadesData
                      .filter((c: any) => favorites.has(c.champion))
                      .map((c: any) => (
                        <button
                          key={c.champion}
                          className="calc-pinned__chip"
                          onClick={() => setSelectedChampion(c)}
                        >
                          {c.image
                            ? <img src={c.image} alt={c.champion} className="calc-pinned__chip-img" />
                            : <span className="calc-pinned__chip-letter">{c.champion.charAt(0)}</span>
                          }
                          <span>{c.champion}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div className="calc-grid">
                {habilidadesData
                  .filter((c: any) =>
                    c.champion.toLowerCase().includes(champSearch.toLowerCase()) &&
                    (!champRegion || c.region === champRegion) &&
                    (!champRole   || c.role   === champRole)   &&
                    (!onlyFav     || favorites.has(c.champion))
                  )
                  .map((champ: any) => (
                    <div
                      key={champ.champion}
                      className="calc-card calc-card--player"
                      onClick={() => setSelectedChampion(champ)}
                    >
                      <div className="calc-card__name calc-card__name--player">{champ.champion}</div>
                      <button
                        className={`calc-star ${favorites.has((champ as any).champion) ? 'calc-star--active' : ''}`}
                        onClick={(e) => toggleFav((champ as any).champion, e)}
                      >★</button>
                    </div>
                  ))}
              </div>
            </>
          )}

          {selectedChampion && (
            <>
              <button className="calc-back-btn" onClick={() => setSelectedChampion(null)}>
                ← Cambiar campeón
              </button>
              <div className="calc-selected-header">
                <div className="calc-selected-header__name">{selectedChampion.champion}</div>
              </div>
              <div className="calc-grid">
                {Object.entries(selectedChampion.abilities).map(([key, ability]: any) => (
                  <div
                    key={key}
                    className={`calc-card calc-card--ability ${!ability.damage ? 'calc-card--ability--inactive' : ''}`}
                    onClick={() =>
                      ability.damage &&
                      setSelectedAbility({
                        playerName: selectedChampion.champion,
                        abilityKey: key,
                        ability,
                      })
                    }
                  >
                    <div className="calc-card__key">[{key}]</div>
                    <div className="calc-card__name">{ability.name || 'Sin nombre'}</div>
                    {ability.damage?.ap && (
                      <div className="calc-card__damage">
                        AP: {ability.damage.ap.map((v: number) => `${Math.round(v * 100)}%`).join(' / ')}
                      </div>
                    )}
                    {!ability.damage && <div className="calc-card__no-calc">Sin cálculo</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════
          PANEL DE DAÑO
      ════════════════════════════════════ */}
      {selectedAbility && (
        <div className="calc-dmg-panel">
          <button className="calc-back-btn" onClick={() => setSelectedAbility(null)}>
            ← Volver a habilidades
          </button>

          <div className="calc-dmg-title">{selectedAbility.ability.name}</div>

          <div className="calc-field">
            <label>Puntos de Habilidad (AP)</label>
            <input
              className="calc-input"
              type="number"
              value={ap}
              onChange={e => setAp(Number(e.target.value))}
            />
          </div>

          <div className="calc-field">
            <label>Nivel de habilidad</label>
            <select
              className="calc-select-dmg"
              value={nivel}
              onChange={e => setNivel(Number(e.target.value))}
            >
              {selectedAbility.ability.damage?.ap?.map((_, i) => (
                <option key={i} value={i + 1}>Nivel {i + 1}</option>
              ))}
            </select>
          </div>

          {selectedAbility.ability.damage?.singleTargetMultiplier && (
            <label className="calc-checkbox-row">
              <input
                type="checkbox"
                checked={objetivoUnico}
                onChange={e => setObjetivoUnico(e.target.checked)}
              />
              Objetivo único (×{selectedAbility.ability.damage.singleTargetMultiplier})
            </label>
          )}

          <div className="calc-result">
            <div className="calc-result__row">
              <span className="calc-result__label">Escalado AP</span>
              <span className="calc-result__value">{(apScaling * 100).toFixed(0)}%</span>
            </div>
            <div className="calc-result__row">
              <span className="calc-result__label">Daño base</span>
              <span className="calc-result__value">{dañoBase.toFixed(1)}</span>
            </div>
            <div className="calc-result__row calc-result__row--final">
              <span className="calc-result__label">Daño final</span>
              <span className="calc-result__value">{dañoFinal.toFixed(1)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════
          MODAL DE CRAFTEO
      ════════════════════════════════════ */}
      {selectedCraftItem && (
        <div className="calc-modal-backdrop" onClick={() => setSelectedCraftItem(null)}>
          <div className="calc-modal" onClick={e => e.stopPropagation()}>

            <div className="calc-modal__cap"><div className="calc-modal__rod" /></div>

            <div className="calc-modal__body">
              <div className="calc-modal__title">{selectedCraftItem.nombre}</div>

              <img
                className="calc-modal__img"
                src={selectedCraftItem.imagen}
                alt={selectedCraftItem.nombre}
              />

              <div className="calc-modal__rule">
                <span className="calc-modal__rule-ornament">✦</span>
              </div>

              {(() => {
                const { fromItems, toItems } = getCraftTree(selectedCraftItem);
                return (
                  <>
                    {fromItems.length > 0 && (
                      <div className="calc-craft-section">
                        <div className="calc-craft-label">Se craftea desde</div>
                        <div className="calc-craft-items">
                          {fromItems.map((item, i) => (
                            <div
                              key={`${item.nombre}-${i}`}
                              className="calc-craft-item"
                              onClick={() => setSelectedCraftItem(item)}
                            >
                              <img src={item.imagen} alt={item.nombre} />
                              <div className="calc-craft-item__name">{item.nombre}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {toItems.length > 0 && (
                      <div className="calc-craft-section">
                        <div className="calc-craft-label">Se craftea en</div>
                        <div className="calc-craft-items">
                          {toItems.map(item => (
                            <div
                              key={item.nombre}
                              className="calc-craft-item"
                              onClick={() => setSelectedCraftItem(item)}
                            >
                              <img src={item.imagen} alt={item.nombre} />
                              <div className="calc-craft-item__name">{item.nombre}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              <button className="calc-modal__close" onClick={() => setSelectedCraftItem(null)}>
                Cerrar
              </button>
            </div>

            <div className="calc-modal__cap"><div className="calc-modal__rod" /></div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Calculos;