import { useState } from 'react';
import { findAbilityRef, type AbilityKind } from '../../data/champions';
import {
  PLAYERS,
  PLAYER_ABILITY_SLOTS,
  savePlayerPatch,
  type Player,
  type PlayerAbilitySlot,
} from '../../data/players';
import { cx } from '../../lib/cx';
import { normalizeName } from '../../lib/text';
import AbilityAssignModal from './AbilityAssignModal';
import { ROLE_ICONS } from './championStyle';

type Props = {
  revision: number;
};

type Picking = {
  playerName: string;
  slot: PlayerAbilitySlot;
  key: 'P' | 'Q' | 'W' | 'E' | 'R';
  kind: AbilityKind;
};

const emptyAbilities = (): Player['abilities'] => ({ P: null, H1: null, H2: null, H3: null, R: null });

const PlayerLoadouts = ({ revision }: Props) => {
  const [players, setPlayers] = useState<Player[]>(() => PLAYERS);
  const [openName, setOpenName] = useState<string | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickingPlayer = picking
    ? players.find(player => player.name === picking.playerName) ?? null
    : null;

  const assign = async (name: string | null) => {
    if (!picking || !pickingPlayer || saving) return;
    const previous = pickingPlayer.abilities;
    const abilities = { ...emptyAbilities(), ...pickingPlayer.abilities, [picking.slot]: name };
    const playerName = pickingPlayer.name;
    setPlayers(current => current.map(player => (
      player.name === playerName ? { ...player, abilities } : player
    )));
    setSaving(true);
    setError(null);
    try {
      const saved = await savePlayerPatch(playerName, { abilities: { [picking.slot]: name } });
      setPlayers(current => current.map(player => (
        normalizeName(player.name) === normalizeName(playerName) ? saved : player
      )));
      setPicking(null);
    } catch (caught) {
      setPlayers(current => current.map(player => (
        normalizeName(player.name) === normalizeName(playerName) ? { ...player, abilities: previous } : player
      )));
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (players.length === 0) {
    return <p className="hab-player-empty">No hay jugadores.</p>;
  }

  return (
    <div className="hab-players">
      {players.map(player => {
        const isOpen = openName === player.name;
        return (
          <div key={player.name} className={cx('hab-champion', 'hab-player', isOpen && 'hab-champion--open')}>
            <button
              type="button"
              className="hab-champion__header"
              aria-expanded={isOpen}
              onClick={() => setOpenName(current => (current === player.name ? null : player.name))}
            >
              <span className="hab-champion__ornament">✦</span>
              <span className="hab-champion__name">{player.name}</span>
              {player.rol && (
                <span className="hab-champion__role">{ROLE_ICONS[player.rol] ?? ''} {player.rol}</span>
              )}
              <span className="hab-champion__keys">
                {PLAYER_ABILITY_SLOTS.map(({ slot, key }) => (
                  <span key={slot} className={cx('hab-key-pip', !!player.abilities?.[slot] && 'hab-key-pip--active')}>
                    {key}
                  </span>
                ))}
              </span>
              <span className="hab-champion__arrow">{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
              <div className="hab-abilities">
                {PLAYER_ABILITY_SLOTS.map(({ slot, key, detail, kind }) => {
                  const assigned = player.abilities?.[slot] ?? null;
                  const ref = findAbilityRef(assigned);
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={cx('hab-ability', assigned ? 'hab-ability--filled' : 'hab-ability--empty')}
                      disabled={saving}
                      onClick={() => {
                        setError(null);
                        setPicking({ playerName: player.name, slot, key, kind });
                      }}
                    >
                      <div className="hab-ability__key">{key}</div>
                      <div className="hab-ability__label">{detail}</div>
                      {assigned ? (
                        <>
                          <div className="hab-ability__name">{ref?.name ?? assigned}</div>
                          <div className="hab-ability__desc">{ref?.champion ?? 'Sin definir'}</div>
                        </>
                      ) : (
                        <div className="hab-ability__none">Asignar</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {picking && pickingPlayer && (
        <AbilityAssignModal
          playerName={pickingPlayer.name}
          rol={pickingPlayer.rol}
          slotLabel={picking.key}
          kind={picking.kind}
          currentName={pickingPlayer.abilities?.[picking.slot] ?? null}
          takenNames={PLAYER_ABILITY_SLOTS
            .filter(({ slot }) => slot !== picking.slot)
            .map(({ slot }) => pickingPlayer.abilities?.[slot])
            .filter((name): name is string => !!name)}
          revision={revision}
          saving={saving}
          error={error}
          onChoose={name => { void assign(name); }}
          onClose={() => {
            if (saving) return;
            setError(null);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
};

export default PlayerLoadouts;
