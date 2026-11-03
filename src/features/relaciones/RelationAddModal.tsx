import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/Modal';
import { CHAMPIONS } from '../../data/champions';
import { loadNpcs, npcCircleFrame, npcImageStyle, sortNpcs, type NpcImageFrame } from '../../data/npcs';
import {
  RELATION_KIND_LABEL,
  RELATION_NOTE_MAX,
  createRelation,
  sameRelationRef,
  type Relation,
  type RelationKind,
  type RelationRef,
} from '../../data/relations';
import { cx } from '../../lib/cx';
import { matchesSearch } from '../../lib/text';

type Props = {
  self: RelationRef;
  selfName: string;
  existing: Relation[];
  onClose: () => void;
  onSaved: (relation: Relation) => void;
};

type Candidate = RelationRef & { name: string; image: string; frame: NpcImageFrame | null; hint: string };

const KINDS: RelationKind[] = ['champion', 'npc'];

/** Admin: elige un campeón o NPC (búsqueda) y una nota opcional para relacionarlo con la ficha abierta. */
const RelationAddModal = ({ self, selfName, existing, onClose, onSaved }: Props) => {
  const [kind, setKind] = useState<RelationKind>(self.kind === 'npc' ? 'npc' : 'champion');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [note, setNote] = useState('');
  const [npcs, setNpcs] = useState<Candidate[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadNpcs()
      .then(list => {
        if (!active) return;
        setNpcs(sortNpcs(list).map(npc => ({
          kind: 'npc',
          id: npc.id,
          name: npc.name,
          image: npc.image,
          frame: npcCircleFrame(npc),
          hint: [npc.type, npc.region].filter(Boolean).join(' · ') || (npc.visible ? 'Visible' : 'Oculto'),
        })));
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'No se pudieron cargar los NPCs');
      });
    return () => {
      active = false;
    };
  }, []);

  const champions = useMemo<Candidate[]>(
    () => [...CHAMPIONS]
      .sort((a, b) => a.champion.localeCompare(b.champion, 'es', { sensitivity: 'base' }))
      .map(c => ({ kind: 'champion', id: c.champion, name: c.champion, image: c.image, frame: null, hint: [c.region, c.role].filter(Boolean).join(' · ') })),
    [],
  );

  const taken = (candidate: RelationRef) =>
    sameRelationRef(candidate, self) || existing.some(r => sameRelationRef(r.other, candidate));

  const source = kind === 'champion' ? champions : npcs ?? [];
  const shown = source.filter(c => !taken(c) && matchesSearch(c.name, search));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!picked) {
      setError(`Elige un ${kind === 'champion' ? 'campeón' : 'NPC'}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await createRelation(self, { kind: picked.kind, id: picked.id }, note.trim()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo crear la relación');
      setSaving(false);
    }
  };

  return createPortal(
    <Modal onClose={() => { if (!saving) onClose(); }} backdropClassName="hab-modal-backdrop" className="hab-modal rel-modal">
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
      <form className="hab-modal__body" onSubmit={e => { void submit(e); }}>
        <div className="hab-modal__kicker">Nueva relación</div>
        <h2 className="hab-modal__title">{selfName}</h2>

        <div className="rel-kinds" role="radiogroup" aria-label="Relacionar con">
          {KINDS.map(option => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              className={cx('calc-learned-toggle', kind === option && 'calc-learned-toggle--on')}
              onClick={() => {
                setKind(option);
                setPicked(null);
              }}
            >
              {option === 'champion' ? 'Campeones' : 'NPCs'}
            </button>
          ))}
        </div>

        <label className="hab-field">
          <span>Buscar {RELATION_KIND_LABEL[kind].toLowerCase()}</span>
          <input
            type="text"
            autoFocus
            value={search}
            placeholder={kind === 'champion' ? 'Nombre del campeón…' : 'Nombre del NPC…'}
            onChange={e => setSearch(e.target.value)}
          />
        </label>

        <div className="rel-pick" role="listbox" aria-label="Candidatos">
          {kind === 'npc' && npcs === null && !error && <p className="calc-build-empty">Cargando NPCs…</p>}
          {(kind === 'champion' || npcs !== null) && shown.length === 0 && (
            <p className="calc-build-empty">No hay {kind === 'champion' ? 'campeones' : 'NPCs'} que añadir.</p>
          )}
          {shown.map(candidate => {
            const on = picked !== null && sameRelationRef(picked, candidate);
            return (
              <button
                key={`${candidate.kind}:${candidate.id}`}
                type="button"
                role="option"
                aria-selected={on}
                className={cx('rel-pick__row', on && 'rel-pick__row--on')}
                onClick={() => setPicked(candidate)}
              >
                <span className="calc-champ-card__portrait rel-pick__portrait">
                  {candidate.image
                    ? <img src={candidate.image} alt="" style={npcImageStyle(candidate.frame)} />
                    : <span aria-hidden="true">{candidate.name.charAt(0)}</span>}
                </span>
                <span className="rel-pick__name">{candidate.name}</span>
                {candidate.hint && <span className="rel-pick__hint">{candidate.hint}</span>}
              </button>
            );
          })}
        </div>

        <label className="hab-field">
          <span>Nota (opcional)</span>
          <input
            type="text"
            maxLength={RELATION_NOTE_MAX}
            value={note}
            placeholder="Hermano, rival, mentor, le debe un favor…"
            onChange={e => setNote(e.target.value)}
          />
        </label>

        {error && <p className="hab-modal__error" role="alert">{error}</p>}

        <div className="hab-modal__actions">
          <button type="submit" className="hab-modal__btn" disabled={saving || !picked}>
            {saving ? 'Guardando…' : picked ? `Relacionar con ${picked.name}` : 'Relacionar'}
          </button>
          <button type="button" className="hab-modal__btn hab-modal__btn--ghost" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
    </Modal>,
    document.body,
  );
};

export default RelationAddModal;
