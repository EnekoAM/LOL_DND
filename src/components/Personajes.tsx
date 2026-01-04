import React, { useState } from 'react';
import playersData from '../players.json';
import habilidadesData from '../habilidades.json';
import ItemsData from '../items.json';

/* ================= TIPOS ================= */

type DamageType = {
  ap?: number[];
  ad?: number[];
  singleTargetMultiplier?: number; // 👈 NUEVO
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
  { key: 'P', label: 'Pasiva' },
  { key: 'H1', label: 'Habilidad 1' },
  { key: 'H2', label: 'Habilidad 2' },
  { key: 'H3', label: 'Habilidad 3' },
  { key: 'R', label: 'Definitiva' },
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
    .filter(Boolean); // eliminamos null

  const toItems = item.craftsTo
    .map(name => ItemsData.find(i => i.nombre.toLowerCase().trim() === name.toLowerCase().trim()))
    .filter(Boolean);

  return { fromItems, toItems };
};


/* ================= COMPONENTE ================= */

const Calculos = () => {
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [selectedAbility, setSelectedAbility] = useState<SelectedAbility | null>(null);
  const [selectedChampion, setSelectedChampion] = useState<any>(null);
  const [champSearch, setChampSearch] = useState('');
  const [selectedCraftItem, setSelectedCraftItem] = useState<typeof ItemsData[0] | null>(null);
  


  const [ap, setAp] = useState(0);
  const [nivel, setNivel] = useState(1);
  const [objetivoUnico, setObjetivoUnico] = useState(false);

  /* ================= CALCULOS ================= */

  const apScaling =
    selectedAbility?.ability.damage?.ap?.[nivel - 1] ?? 0;

  const dañoBase = ap * apScaling;

  const singleTargetMultiplier =
    selectedAbility?.ability.damage?.singleTargetMultiplier ?? 1;

  const dañoFinal =
    objetivoUnico ? dañoBase * singleTargetMultiplier : dañoBase;


  return (
    <div style={container}>
      {!selectedAbility && (
        <h2 style={title}>Calculadora por Player</h2>
      )}

      {/* ================= SELECT PLAYER ================= */}
      {!selectedPlayer && !selectedAbility && (
        <div style={grid}>
          {playersData.map((player: any) => (
            <div
              key={player.name}
              style={playerCard}
              onClick={() => setSelectedPlayer(player)}
            >
              <h3 style={{ color: '#c084fc' }}>{player.name}</h3>
            </div>
          ))}
        </div>
      )}

      {/* ================= PLAYER ABILITIES ================= */}
      {selectedPlayer && !selectedAbility && (
        <div>
          <button style={backBtn} onClick={() => setSelectedPlayer(null)}>
            ← Cambiar player
          </button>

          <h3 style={subtitle}>{selectedPlayer.name}</h3>

          {selectedPlayer.basicAttack && (
            <div style={basicAttack}>
              <strong>Ataque básico:</strong>{' '}
              {selectedPlayer.basicAttack.scaling
                .map((v: number) => `${Math.round(v * 100)}%`)
                .join(' / ')}{' '}
              AP
            </div>
          )}

          <div style={grid}>
            {abilityOrder.map(({ key, label }) => {
              const abilityName = selectedPlayer.abilities[key];
              const abilityData = findAbility(abilityName);

              return (
                <div
                  key={key}
                  style={abilityCard}
                  onClick={() =>
                    abilityData?.damage &&
                    setSelectedAbility({
                      playerName: selectedPlayer.name,
                      abilityKey: key,
                      ability: abilityData,
                    })
                  }
                >
                  <div style={abilityKey}>[{label}]</div>
                  <div style={abilityTitle}>
                    {abilityName ?? 'No definida'}
                  </div>

                  {abilityData ? (
                    <>

                      {abilityData.damage?.ap && (
                        <div style={damage}>
                          AP:{' '}
                          {abilityData.damage.ap
                            .map((v) => `${Math.round(v * 100)}%`)
                            .join(' / ')}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={undefinedText}>
                      Habilidad no implementada
                    </div>
                  )}

                  {!abilityData?.damage && (
                    <div style={noCalc}>Sin cálculo</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}


{/* ================= EQUIPAMIENTO Y BUILD ================= */
}{selectedPlayer && !selectedAbility && (
  <>
    {/* Equipamiento actual */}
    <h3 style={{ marginTop: '2rem', marginBottom: '0.5rem', color: '#c084fc' }}>
      Equipamiento actual
    </h3>
    <div style={grid}>
      {selectedPlayer.equipamiento.map((itemName: string, index: number) => {
        const itemData = ItemsData.find(
          (i) => i.nombre.toLowerCase().trim() === itemName.toLowerCase().trim()
        );
        return (
          <div
            key={index}
            style={abilityCard}
            onClick={() => itemData && setSelectedCraftItem(itemData)}
          >
            {itemData?.imagen && (
              <img
                src={itemData.imagen}
                alt={itemName}
                style={{ width: '100%', borderRadius: '8px', marginBottom: '0.5rem' }}
              />
            )}
            <div>{itemName}</div>
          </div>
        );
      })}
    </div>

    {/* Build deseada */}
    <h3 style={{ marginTop: '2rem', marginBottom: '0.5rem', color: '#c084fc' }}>
      Build deseada
    </h3>
    <div style={grid}>
      {selectedPlayer.build.map((itemName: string, index: number) => {
        const itemData = ItemsData.find((i) => i.nombre === itemName);
        return (
          <div
            key={index}
            style={abilityCard}
            onClick={() => itemData && setSelectedCraftItem(itemData)}
          >
            {itemData?.imagen && (
              <img
                src={itemData.imagen}
                alt={itemName}
                style={{ width: '100%', borderRadius: '8px', marginBottom: '0.5rem' }}
              />
            )}
            <div>{itemName}</div>
          </div>
        );
      })}
    </div>

  {/* Modal de crafteos */}
  {selectedCraftItem && (
  <div
    onClick={() => setSelectedCraftItem(null)}
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
    }}
  >
    <div
      onClick={e => e.stopPropagation()}
      style={{
        backgroundColor: '#1e1e1e',
        color: '#fff',
        padding: '2rem',
        borderRadius: '12px',
        maxWidth: '600px',
        width: '90%',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        alignItems: 'center',
      }}
    >
      <h2 style={{ color: '#c084fc' }}>{selectedCraftItem.nombre}</h2>
      <img
        src={selectedCraftItem.imagen}
        alt={selectedCraftItem.nombre}
        style={{ width: '120px', borderRadius: '8px', marginBottom: '1rem' }}
      />

      {/* Árbol genealógico */}
      {(() => {
        const { fromItems, toItems } = getCraftTree(selectedCraftItem);

        return (
          <>
            {fromItems.length > 0 && (
              <div style={{ width: '100%' }}>
                <h3 style={{ color: '#a5f3fc', marginBottom: '0.5rem' }}>Se crafteó desde:</h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {fromItems.map(i => (
                    <div
                      key={i!.nombre}
                      title={i!.nombre} // hover muestra nombre
                      style={{ width: '80px', position: 'relative' }}
                    >
                      <img
                        src={i!.imagen}
                        alt={i!.nombre}
                        style={{ width: '100%', borderRadius: '6px', cursor: 'pointer' }}
                        onClick={() => setSelectedCraftItem(i!)} // abrir modal del item anterior
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {toItems.length > 0 && (
              <div style={{ width: '100%' }}>
                <h3 style={{ color: '#c084fc', marginBottom: '0.5rem' }}>Se puede craftear en:</h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {toItems.map(i => (
                    <div
                      key={i!.nombre}
                      title={i!.nombre} // hover muestra nombre
                      style={{ width: '80px', position: 'relative' }}
                    >
                      <img
                        src={i!.imagen}
                        alt={i!.nombre}
                        style={{ width: '100%', borderRadius: '6px', cursor: 'pointer' }}
                        onClick={() => setSelectedCraftItem(i!)} // abrir modal del item siguiente
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      <button
        onClick={() => setSelectedCraftItem(null)}
        style={{
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: '#c084fc',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        Cerrar
      </button>
    </div>
  </div>
)}



  </>
)}



      {/* ================= DM – CHAMPIONS ================= */}
      {!selectedAbility && (
        <>
          <hr style={{ margin: '3rem 0', borderColor: '#333' }} />
          <h2 style={title}>Calculadora por Campeón (DM)</h2>
          {/* Input de búsqueda */}
          <input
            type="text"
            placeholder="Buscar campeón..."
            value={champSearch}
            onChange={(e) => setChampSearch(e.target.value)}
            style={input}
          />

        </>

      )}
      {/* Selección de campeón */}
      {!selectedChampion && !selectedAbility && (
        <div style={grid}>
          {habilidadesData
            .filter((champ) =>
              champ.champion.toLowerCase().includes(champSearch.toLowerCase())
            )
            .map((champ: any) => (
              <div
                key={champ.champion}
                style={playerCard}
                onClick={() => setSelectedChampion(champ)}
              >
                <h3 style={{ color: '#c084fc' }}>{champ.champion}</h3>
              </div>
            ))}
        </div>
      )}

      {/* Habilidades del campeón */}
      {selectedChampion && !selectedAbility && (
        <div>
          <button style={backBtn} onClick={() => setSelectedChampion(null)}>
            ← Cambiar campeón
          </button>

          <h3 style={subtitle}>{selectedChampion.champion}</h3>

          <div style={grid}>
            {Object.entries(selectedChampion.abilities).map(
              ([key, ability]: any) => (
                <div
                  key={key}
                  style={abilityCard}
                  onClick={() =>
                    ability.damage &&
                    setSelectedAbility({
                      playerName: selectedChampion.champion,
                      abilityKey: key,
                      ability,
                    })
                  }
                >
                  <div style={abilityKey}>[{key}]</div>

                  <div style={abilityTitle}>
                    {ability.name || 'Sin nombre'}
                  </div>

                  {ability.damage?.ap && (
                    <div style={damage}>
                      AP:{' '}
                      {ability.damage.ap
                        .map((v: number) => `${Math.round(v * 100)}%`)
                        .join(' / ')}
                    </div>
                  )}

                  {!ability.damage && (
                    <div style={noCalc}>Sin cálculo</div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ================= CALCULADORA ================= */}
      {selectedAbility && (
        <div style={card}>
          <button style={backBtn} onClick={() => setSelectedAbility(null)}>
            ← Volver a habilidades
          </button>

          <h3 style={{ color: '#c084fc' }}>
            {selectedAbility.ability.name}
          </h3>

          <label>AP</label>
          <input
            type="number"
            value={ap}
            onChange={(e) => setAp(Number(e.target.value))}
            style={input}
          />

          <label>Nivel</label>
          <select
            value={nivel}
            onChange={(e) => setNivel(Number(e.target.value))}
            style={input}
          >
            {selectedAbility.ability.damage?.ap?.map((_, i) => (
              <option key={i} value={i + 1}>
                Nivel {i + 1}
              </option>
            ))}
          </select>

          {selectedAbility.ability.damage?.singleTargetMultiplier && (
            <div style={checkboxRow}>
              <input
                type="checkbox"
                checked={objetivoUnico}
                onChange={(e) => setObjetivoUnico(e.target.checked)}
              />
              Objetivo único (x
              {selectedAbility.ability.damage.singleTargetMultiplier})
            </div>
          )}


          <div style={resultBox}>
            <p>Escalado AP: {(apScaling * 100).toFixed(0)}%</p>
            <p>Daño base: {dañoBase.toFixed(1)}</p>
            <p style={finalDamage}>
              Daño final: {dañoFinal.toFixed(1)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calculos;

/* ================= ESTILOS ================= */

const container: React.CSSProperties = {
  maxWidth: '1100px',
  margin: '0 auto',
  padding: '2rem',
  color: '#fff',
};

const title = { color: '#c084fc', marginBottom: '1rem' };
const subtitle = { color: '#c084fc', marginBottom: '1rem' };

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '1rem',
};

const playerCard = {
  backgroundColor: '#1e1e1e',
  padding: '1.5rem',
  borderRadius: '12px',
  cursor: 'pointer',
};

const abilityCard = {
  backgroundColor: '#262626',
  padding: '1rem',
  borderRadius: '10px',
  cursor: 'pointer',
};

const abilityKey = { color: '#a3e635', fontWeight: 'bold' };
const abilityTitle = { fontWeight: 600 };
const abilityDesc = { fontSize: '0.85rem', color: '#ccc' };
const damage = { color: '#93c5fd', fontSize: '0.8rem' };
const undefinedText = { color: '#666', fontSize: '0.8rem' };
const noCalc = { color: '#888', fontSize: '0.75rem', marginTop: '0.25rem' };

const basicAttack = {
  backgroundColor: '#2a2a2a',
  padding: '0.5rem 1rem',
  borderRadius: '8px',
  marginBottom: '1rem',
};

const card = {
  backgroundColor: '#1e1e1e',
  padding: '1.5rem',
  borderRadius: '12px',
};

const input = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: '8px',
  backgroundColor: '#111',
  border: '1px solid #444',
  color: '#fff',
  marginBottom: '1rem',
};

const checkboxRow = {
  display: 'flex',
  gap: '0.5rem',
  marginBottom: '1rem',
};

const resultBox = {
  backgroundColor: '#2a2a2a',
  padding: '1rem',
  borderRadius: '8px',
};

const finalDamage = { color: '#a3e635', fontWeight: 'bold' };

const backBtn = {
  marginBottom: '1rem',
  background: 'none',
  border: 'none',
  color: '#93c5fd',
  cursor: 'pointer',
};
