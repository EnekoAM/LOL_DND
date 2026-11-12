import type { PermanentStackEntry } from '../../data/permanentStacks';
import StackCounter from './StackCounter';

type Props = {
  entries: PermanentStackEntry[];
  disabled?: boolean;
  onChange: (key: string, next: number) => void;
};

/** «Cargas permanentes» del personaje (se guardan en su ficha; solo suman con el ítem equipado). */
export default function PermanentStacks({ entries, disabled, onChange }: Props) {
  if (entries.length === 0) return null;
  return (
    <div className="permanent-stacks">
      <span className="permanent-stacks__title" title="Se guardan en la ficha: siguen entre combates y aunque se quite el ítem. Solo suman con un ítem con ese efecto equipado.">Cargas permanentes</span>
      <ul className="permanent-stacks__list">
        {entries.map(entry => (
          <li key={entry.key} className={entry.equipped ? 'permanent-stacks__row' : 'permanent-stacks__row permanent-stacks__row--off'}>
            <span className="permanent-stacks__name" title={`${entry.perStack}${entry.item ? ` · ${entry.item}` : ''}`}>
              {entry.name}{entry.equipped ? '' : entry.item ? '' : ' (sin equipar: no suma)'}
            </span>
            <StackCounter value={entry.value} max={entry.max} disabled={disabled} label={`Cargas permanentes · ${entry.name}`} onChange={next => onChange(entry.key, next)} />
            <span className="permanent-stacks__hint">{entry.perStack}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
