import { createPortal } from 'react-dom';
import { COMBAT_EFFECT_PRESETS, type CombatEffect, type CombatParticipant } from '../../data/combat';
import { findAbilityRef } from '../../data/champions';
import { findItem } from '../../data/items';
import { PLAYERS } from '../../data/players';
import {
  abilityCooldownKey,
  abilityStackKey,
  itemActiveEffectKey,
  itemCooldownKey,
  itemStackKey,
  readActiveEffect,
  readCooldown,
  readStack,
} from '../../data/stacks';
import { cx } from '../../lib/cx';
import StackCounter from '../players/StackCounter';
import { effectIcon, effectNeedsValue, effectToneClass, formatEffectLabel, kindTag } from './combatHelpers';

type Props = {
  participant: CombatParticipant;
  isAdmin: boolean;
  saving: boolean;
  /** Fuerza relectura de PLAYERS tras Activar / tick. */
  trackerRev: number;
  onPlayerTrackersChange: (
    playerName: string,
    patch: {
      cooldowns?: Record<string, number>;
      activeEffects?: Record<string, number>;
      stacks?: Record<string, number>;
    },
  ) => Promise<void>;
  effectPick: string;
  effectDur: string;
  effectValue: string;
  customEffect: string;
  onEffectPick: (value: string) => void;
  onEffectDur: (value: string) => void;
  onEffectValue: (value: string) => void;
  onCustomEffect: (value: string) => void;
  onClose: () => void;
  onInitiative: (value: number) => void;
  onRollInitiative: () => void;
  onToggleDefeated: () => void;
  onRemove: () => void;
  onAddEffect: () => void;
  onRemoveEffect: (effectId: string) => void;
};

type TrackerRow = {
  key: string;
  label: string;
  kind: 'item' | 'ability';
  name: string;
  stacks?: { value: number; max?: number };
  cd?: { remaining: number; duration: number };
  effect?: { remaining: number; duration: number };
};

/** Panel lateral con controles (GM edita; players solo ven). Sin PG. */
export default function CombatParticipantPanel({
  participant,
  isAdmin,
  saving,
  trackerRev,
  onPlayerTrackersChange,
  effectPick,
  effectDur,
  effectValue,
  customEffect,
  onEffectPick,
  onEffectDur,
  onEffectValue,
  onCustomEffect,
  onClose,
  onInitiative,
  onRollInitiative,
  onToggleDefeated,
  onRemove,
  onAddEffect,
  onRemoveEffect,
}: Props) {
  void trackerRev;

  return createPortal(
    <div className="combat-panel-backdrop" onClick={onClose}>
      <aside
        className="combat-panel"
        role="dialog"
        aria-modal="true"
        aria-label={participant.name}
        onClick={e => e.stopPropagation()}
      >
        <header className="combat-panel__head">
          {participant.image
            ? <img className="combat-panel__img" src={participant.image} alt="" width={56} height={56} />
            : <span className="combat-panel__img combat-panel__img--fallback" aria-hidden>⚔</span>}
          <div className="combat-panel__titles">
            <p className="combat-panel__kicker">{kindTag(participant.kind)}</p>
            <h2 className="combat-panel__title">{participant.name}</h2>
          </div>
          <button type="button" className="combat-btn combat-btn--small" onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        <div className="combat-panel__section">
          <h3 className="combat-panel__label">Iniciativa</h3>
          <div className="combat-panel__row">
            <input
              type="number"
              value={participant.initiative}
              disabled={!isAdmin || saving}
              onChange={e => onInitiative(Number.parseInt(e.target.value, 10) || 0)}
            />
            {isAdmin && (
              <button type="button" className="combat-btn combat-btn--small" disabled={saving} onClick={onRollInitiative}>
                Tirar
              </button>
            )}
          </div>
        </div>

        {participant.kind === 'player' && participant.sourceId && (() => {
          const live = PLAYERS.find(p => p.name === participant.sourceId);
          if (!live) return null;
          const playerName = live.name;
          const equip = live.equipamiento ?? [];
          const abilityNames = Object.values(live.abilities ?? {}).filter((n): n is string => typeof n === 'string' && !!n);
          const rows: TrackerRow[] = [];
          for (const name of equip) {
            const item = findItem(name);
            if (!item) continue;
            const entry: TrackerRow = { key: `item:${name}`, label: name, kind: 'item', name };
            if (item.hasStacks) entry.stacks = { value: readStack(live.stacks, itemStackKey(name)), max: item.maxStacks };
            if (typeof item.cooldown === 'number' && item.cooldown > 0) {
              entry.cd = { remaining: readCooldown(live.cooldowns, itemCooldownKey(name)), duration: item.cooldown };
            }
            if (typeof item.effectDuration === 'number' && item.effectDuration > 0) {
              entry.effect = {
                remaining: readActiveEffect(live.activeEffects, itemActiveEffectKey(name)),
                duration: item.effectDuration,
              };
            }
            if (entry.stacks || entry.cd || entry.effect) rows.push(entry);
          }
          for (const name of abilityNames) {
            const ref = findAbilityRef(name);
            const ability = ref?.ability;
            if (!ability) continue;
            const entry: TrackerRow = { key: `ability:${name}`, label: name, kind: 'ability', name };
            if (ability.hasStacks) entry.stacks = { value: readStack(live.stacks, abilityStackKey(name)), max: ability.maxStacks };
            if (typeof ability.cooldown === 'number' && ability.cooldown > 0) {
              entry.cd = { remaining: readCooldown(live.cooldowns, abilityCooldownKey(name)), duration: ability.cooldown };
            }
            if (entry.stacks || entry.cd) rows.push(entry);
          }
          if (rows.length === 0) return null;

          const activateItem = (row: TrackerRow) => {
            if (row.kind !== 'item' || !isAdmin || saving) return;
            const patch: { cooldowns?: Record<string, number>; activeEffects?: Record<string, number> } = {};
            if (row.cd) patch.cooldowns = { [itemCooldownKey(row.name)]: row.cd.duration };
            if (row.effect) patch.activeEffects = { [itemActiveEffectKey(row.name)]: row.effect.duration };
            if (!patch.cooldowns && !patch.activeEffects) return;
            void onPlayerTrackersChange(playerName, patch);
          };

          return (
            <div className="combat-panel__section">
              <h3 className="combat-panel__label">Stacks / CD</h3>
              <ul className="combat-panel__trackers">
                {rows.map(row => {
                  const onCd = (row.cd?.remaining ?? 0) > 0;
                  const canActivate = row.kind === 'item' && !onCd && !!(row.cd || row.effect);
                  return (
                    <li key={row.key} className="combat-panel__tracker">
                      <span className="combat-panel__tracker-name" title={row.label}>{row.label}</span>
                      <span className="combat-panel__tracker-badges">
                        {row.stacks && (
                          isAdmin ? (
                            <StackCounter
                              value={row.stacks.value}
                              max={row.stacks.max}
                              disabled={saving}
                              label={`Stacks · ${row.label}`}
                              onChange={next => {
                                const key = row.kind === 'item' ? itemStackKey(row.name) : abilityStackKey(row.name);
                                void onPlayerTrackersChange(playerName, { stacks: { [key]: next } });
                              }}
                            />
                          ) : (
                            <span className="combat-panel__badge" title="Stacks">
                              ▣ {row.stacks.value}{typeof row.stacks.max === 'number' ? `/${row.stacks.max}` : ''}
                            </span>
                          )
                        )}
                        {row.cd && (
                          <span className={cx('combat-panel__badge', onCd && 'combat-panel__badge--cd')} title="Cooldown">
                            {onCd ? `CD ${row.cd.remaining}` : 'Listo'}
                          </span>
                        )}
                        {row.effect && row.effect.remaining > 0 && (
                          <span className="combat-panel__badge combat-panel__badge--effect" title="Efecto">
                            Efecto {row.effect.remaining}
                          </span>
                        )}
                        {isAdmin && canActivate && (
                          <button
                            type="button"
                            className="combat-btn combat-btn--small combat-panel__activate"
                            disabled={saving}
                            onClick={() => activateItem(row)}
                          >
                            Activar
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })()}

        <div className="combat-panel__section">
          <h3 className="combat-panel__label">Estados</h3>
          <div className="combat-panel__effects">
            {participant.effects.length === 0 && <p className="combat-page__hint">Sin estados.</p>}
            {participant.effects.map((effect: CombatEffect) => (
              <button
                key={effect.id}
                type="button"
                className={`combat-effect ${effectToneClass(effect.name)}`.trim()}
                disabled={!isAdmin || saving}
                title={isAdmin ? 'Quitar' : formatEffectLabel(effect)}
                onClick={() => isAdmin && onRemoveEffect(effect.id)}
              >
                <span aria-hidden>{effectIcon(effect.name)}</span> {formatEffectLabel(effect)} · {effect.duration}
              </button>
            ))}
          </div>
          {isAdmin && (
            <div className="combat-panel__effect-add">
              <select className="combat-panel__effect-preset" value={effectPick} onChange={e => onEffectPick(e.target.value)}>
                {COMBAT_EFFECT_PRESETS.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <input className="combat-panel__effect-custom" value={customEffect} placeholder="Custom" onChange={e => onCustomEffect(e.target.value)} />
              {effectNeedsValue(customEffect.trim() || effectPick) && (
                <input
                  className="combat-panel__effect-num"
                  value={effectValue}
                  inputMode="numeric"
                  placeholder="−N"
                  title="Reducción (p. ej. 2 → AC −2)"
                  onChange={e => onEffectValue(e.target.value)}
                />
              )}
              <input
                className="combat-panel__effect-num"
                value={effectDur}
                inputMode="numeric"
                title="Duración (turnos)"
                placeholder="T"
                onChange={e => onEffectDur(e.target.value)}
              />
              <button type="button" className="combat-btn combat-btn--small" disabled={saving} onClick={onAddEffect}>+</button>
            </div>
          )}
        </div>

        {isAdmin && (
          <div className={cx('combat-panel__actions')}>
            <button type="button" className="combat-btn" disabled={saving} onClick={onToggleDefeated}>
              {participant.defeated ? 'Revivir' : 'Derrotado'}
            </button>
            <button type="button" className="combat-btn combat-btn--danger" disabled={saving} onClick={onRemove}>
              Quitar
            </button>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
