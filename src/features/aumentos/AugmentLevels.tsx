import './AugmentLevels.css';

type Props = {
  /** Efectos de nivel 1.. (hasta 3) del aumento; un texto vacío es un nivel sin efecto propio. */
  levels: string[];
  /** Nivel actual del aumento (si alguien lo tiene); se resalta y los demás quedan atenuados. */
  current?: number;
};

/** Insignia «Niveles 1–N» o «Nivel X/N» (nivel del aumento, no del player). N = último nivel con efecto. */
export const AugmentLevelBadge = ({ max, current }: { max: number; current?: number }) => (
  <span className="aug-lvl-badge" title="Nivel del aumento (aparte del nivel del player)">
    {current ? `Nivel ${current}/${max}` : max > 1 ? `Niveles 1–${max}` : 'Nivel 1'}
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
          <span className={`aug-lvl__text${effect ? '' : ' aug-lvl__text--empty'}`}>{effect || 'Sin efecto propio'}</span>
        </li>
      );
    })}
  </ol>
);

export default AugmentLevelList;
