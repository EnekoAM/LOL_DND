import { ABILITY_KEYS, type AbilityKey, type Champion } from '../../data/champions';
import { cssVars } from '../../lib/cssVars';
import { cx } from '../../lib/cx';
import { ABILITY_LABELS, ROLE_ICONS, regionColor } from './championStyle';

type Props = {
  champion: Champion;
  isOpen: boolean;
  onToggle: (championName: string) => void;
  onOpenAbility: (slot: AbilityKey) => void;
};

const ChampionAbilities = ({ abilities, onOpenAbility }: Pick<Champion, 'abilities'> & Pick<Props, 'onOpenAbility'>) => (
  <div className="hab-abilities">
    {ABILITY_KEYS.map(key => {
      const ability = abilities[key];
      return (
        <button
          key={key}
          type="button"
          className={cx('hab-ability', ability ? 'hab-ability--filled' : 'hab-ability--empty')}
          onClick={() => onOpenAbility(key)}
        >
          <div className="hab-ability__key">{key}</div>
          <div className="hab-ability__label">{ABILITY_LABELS[key]}</div>
          {ability ? (
            <>
              <div className="hab-ability__name">{ability.name || 'Sin nombre'}</div>
              <div className="hab-ability__desc">{ability.description}</div>
            </>
          ) : (
            <div className="hab-ability__none">— No disponible —</div>
          )}
        </button>
      );
    })}
  </div>
);

const ChampionRow = ({ champion, isOpen, onToggle, onOpenAbility }: Props) => (
  <div
    className={cx('hab-champion', isOpen && 'hab-champion--open')}
    style={cssVars({ '--champ-color': regionColor(champion.region) })}
  >
    <button className="hab-champion__header" onClick={() => onToggle(champion.champion)}>
      <span className="hab-champion__ornament">✦</span>
      {champion.image ? (
        <img className="hab-champion__avatar" src={champion.image} alt={champion.champion} />
      ) : (
        <span className="hab-champion__avatar hab-champion__avatar--empty">
          {champion.champion.charAt(0)}
        </span>
      )}
      <span className="hab-champion__name">{champion.champion}</span>
      <span className="hab-champion__region">{champion.region}</span>
      <span className="hab-champion__role">
        {ROLE_ICONS[champion.role]} {champion.role}
      </span>
      <span className="hab-champion__keys">
        {ABILITY_KEYS.map(key => (
          <span key={key} className={cx('hab-key-pip', !!champion.abilities[key] && 'hab-key-pip--active')}>
            {key}
          </span>
        ))}
      </span>
      <span className="hab-champion__arrow">{isOpen ? '▲' : '▼'}</span>
    </button>

    {isOpen && <ChampionAbilities abilities={champion.abilities} onOpenAbility={onOpenAbility} />}
  </div>
);

export default ChampionRow;
