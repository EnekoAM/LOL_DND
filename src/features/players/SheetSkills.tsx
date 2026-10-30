import { useState } from 'react';
import { DND_SKILLS, proficiencyBonus, type DndSkillKey, type DndSkillProficiencies } from '../../data/dndSkills';
import type { PlayerSheet } from '../../data/players';
import { cx } from '../../lib/cx';
import { ABILITY_SCORES, DEFAULT_SCORE, scoreModifier } from '../calculos/playerSheets';
import './SheetSkills.css';

type Props = {
  sheet: PlayerSheet | undefined;
  level: number;
  saving: boolean;
  error: string | null;
  onSave: (sheet: PlayerSheet) => Promise<void>;
};

const SHORT = Object.fromEntries(ABILITY_SCORES.map(({ key, short }) => [key, short]));

const formatModifier = (value: number): string => (value >= 0 ? `+${value}` : String(value));

/** Habilidades D&D 5e (Acrobacias, Atletismo…): círculo de competencia + modificador. */
const SheetSkills = ({ sheet, level, saving, error, onSave }: Props) => {
  const [pending, setPending] = useState<DndSkillKey | null>(null);
  const bonus = proficiencyBonus(level);
  const skills = sheet?.skills ?? {};
  const busy = saving || pending !== null;

  const toggle = async (key: DndSkillKey) => {
    if (!sheet || busy) return;
    const next: DndSkillProficiencies = { ...skills };
    if (next[key]) delete next[key];
    else next[key] = true;
    setPending(key);
    try {
      await onSave({ ...sheet, skills: next });
    } catch {
      // Players muestra el error de guardado.
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="sheet-panel sheet-general__combat sheet-general__skills">
      <div className="sheet-panel__title">
        Habilidades
        <span className="sheet-panel__meta" title="Bono de competencia por nivel">
          Comp. {formatModifier(bonus)}
        </span>
      </div>
      {!sheet && <p className="calc-build-empty">Sin ficha: crea las características para marcar competencias.</p>}
      <ul className="sheet-skills">
        {DND_SKILLS.map(({ key, label, ability: baseAbility, altAbilities }) => {
          const proficient = skills[key] === true;
          const modOf = (a: typeof baseAbility) => scoreModifier(sheet?.scores?.[a] ?? DEFAULT_SCORE);
          const ability = (altAbilities ?? []).reduce((best, a) => (modOf(a) > modOf(best) ? a : best), baseAbility);
          const value = modOf(ability) + (proficient ? bonus : 0);
          return { key, label, ability, proficient, value };
        })
          .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'))
          .map(({ key, label, ability, proficient, value }) => {
          return (
            <li key={key} className={cx('sheet-skill', proficient && 'sheet-skill--prof')}>
              <button
                type="button"
                className={cx('sheet-skill__dot', proficient && 'sheet-skill__dot--on')}
                onClick={() => toggle(key)}
                disabled={!sheet || busy}
                aria-pressed={proficient}
                aria-label={`${proficient ? 'Quitar' : 'Marcar'} competencia en ${label}`}
                title={proficient ? 'Competente (pulsa para quitar)' : 'Sin competencia (pulsa para marcar)'}
              />
              <span className="sheet-skill__ability">{SHORT[ability]}</span>
              <span className="sheet-skill__label">{label}</span>
              <span className="sheet-skill__value">{formatModifier(value)}</span>
            </li>
          );
        })}
      </ul>
      {error && <p className="sheet-hp__error">{error}</p>}
    </section>
  );
};

export default SheetSkills;