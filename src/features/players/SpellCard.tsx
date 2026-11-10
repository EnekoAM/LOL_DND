import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import PhaseTabs from '../habilidades/PhaseTabs';

export type SpellTone = 'pasiva' | 'basica' | 'definitiva' | 'auto';

export const SPELL_TYPE_LABEL: Record<Exclude<SpellTone, 'auto'>, string> = {
  pasiva: 'Pasiva',
  basica: 'Básica',
  definitiva: 'Definitiva',
};

type SpellCardProps = {
  tone: SpellTone;
  /** Letra del sello: P, Q, W, E, R, AA. */
  seal: string;
  name: string;
  type: string;
  champion?: string;
  image?: string;
  empty?: boolean;
  note?: string;
  badge?: ReactNode;
  onOpen?: () => void;
  ranks?: ReactNode;
  stacks?: ReactNode;
  cooldown?: ReactNode;
  action?: ReactNode;
  /** El sello hexagonal es el icono (sin retrato). */
  sealAsIcon?: boolean;
  /** El botón de acción va abajo, a ancho completo. */
  footerAction?: boolean;
  /** Fases de una habilidad con variantes (Fase 1, Fase 2…). */
  phases?: string[];
  /** Las fases se eligen al usar (combos). */
  phasesChoose?: boolean;
};

const SpellCard = ({
  tone,
  seal,
  name,
  type,
  champion,
  image,
  empty,
  note,
  badge,
  onOpen,
  ranks,
  stacks,
  cooldown,
  action,
  sealAsIcon,
  footerAction,
  phases,
  phasesChoose,
}: SpellCardProps) => (
  <article
    className={cx(
      'spell',
      `spell--${tone}`,
      empty && 'spell--empty',
      onOpen && 'spell--clickable',
      sealAsIcon && 'spell--seal-icon',
      footerAction && 'spell--footer-action',
    )}
    onClick={onOpen}
    title={onOpen ? 'Abrir habilidad / tirar daño' : undefined}
    role={onOpen ? 'button' : undefined}
    tabIndex={onOpen ? 0 : undefined}
    onKeyDown={event => {
      if (event.target === event.currentTarget && onOpen && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        onOpen();
      }
    }}
  >
    <span className="spell__corner spell__corner--tl" aria-hidden />
    <span className="spell__corner spell__corner--br" aria-hidden />
    {phases && phases.length > 1 && (
      <div className="spell__phases" title="Habilidad con fases: ábrela para ver cada una">
        <PhaseTabs small labels={phasesChoose ? [...phases, 'A elegir'] : phases} active={-1} onSelect={() => onOpen?.()} />
      </div>
    )}
    <header className="spell__head">
      <div className="spell__icon" aria-hidden>
        {image && !empty && !sealAsIcon
          ? <img src={image} alt="" loading="lazy" />
          : <span className="spell__glyph">{empty ? '?' : sealAsIcon ? seal : '✦'}</span>}
        {(!sealAsIcon) && <span className="spell__seal">{seal}</span>}
      </div>
      <div className="spell__titles">
        <div className="spell__type">{type}</div>
        <div className="spell__name">{name}</div>
        {champion && <div className="spell__origin">{champion}</div>}
        {note && <div className="spell__note">{note}</div>}
        {badge && <div className="spell__badge">{badge}</div>}
      </div>
    </header>
    {ranks && (
      <div className="spell__ranks" onClick={event => event.stopPropagation()}>
        {ranks}
      </div>
    )}
    {stacks && (
      <div className="spell__stacks" onClick={event => event.stopPropagation()}>
        {stacks}
      </div>
    )}
    {cooldown && (
      <div className="spell__stacks" onClick={event => event.stopPropagation()}>
        {cooldown}
      </div>
    )}
    {action && (
      <div className="spell__action" onClick={event => event.stopPropagation()}>
        {action}
      </div>
    )}
  </article>
);

export default SpellCard;
