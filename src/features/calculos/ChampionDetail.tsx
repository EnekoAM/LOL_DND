import { ABILITY_KEYS, type Ability, type Champion } from '../../data/champions';
import AbilityCard from './AbilityCard';
import SelectionHeader from './SelectionHeader';

type Props = {
  champion: Champion;
  onBack: () => void;
  onSelectAbility: (ability: Ability) => void;
};

const ChampionDetail = ({ champion, onBack, onSelectAbility }: Props) => (
  <>
    <SelectionHeader name={champion.champion} backLabel="← Cambiar campeón" onBack={onBack} />

    <div className="calc-grid">
      {ABILITY_KEYS.map(key => {
        const ability = champion.abilities[key];
        return ability && (
          <AbilityCard
            key={key}
            label={key}
            name={ability.name || 'Sin nombre'}
            ability={ability}
            onSelect={onSelectAbility}
          />
        );
      })}
    </div>
  </>
);

export default ChampionDetail;
