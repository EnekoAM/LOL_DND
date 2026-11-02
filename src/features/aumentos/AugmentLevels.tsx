import { AUGMENT_LEVEL_COUNT } from '../../data/augments';
import './AugmentLevels.css';

type Props = {
  /** Efectos de nivel 1, 2 y 3 del aumento. */
  levels: string[];
  /** Nivel actual del aumento (si alguien lo tiene); se resalta y los demás quedan atenuados. */
  current?: number;
};

/** Insignia «Niveles 1–3» o «Nivel N/3» (nivel del aumento, no del player). */
export const AugmentLevelBadge = ({ current }: { current?: number }) => (
  <span className="aug-lvl-badge" title="Nivel del aumento (aparte del nivel del player)">
    {current ? `Nivel ${current}/${AUGMENT_LEVEL_COUNT}` : `Niveles 1–${AUGMENT_LEVEL_COUNT}`}
  </span>
);

/** Lista con el efecto de cada nivel del aumento. */
const AugmentLevelList = ({ levels, current }: Props) => (
  <ol className="aug-lvls">
    {levels.map((effect, index) => {
      const level = index + 1;
      const state = current === undefined ? '' : level === current ? ' aug-lvl--current' : level < current ? ' aug-lvl--past' : ' aug-lvl--next';
      return (
        <li key={level} className={`aug-lvl${state}`}>
          <span className="aug-lvl__num">Nv {level}</span>
          <span className="aug-lvl__text">{effect}</span>
        </li>
      );
    })}
  </ol>
);

export default AugmentLevelList;
