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
  /** Si alguna falla: las que sí se crearon (el modal sigue abierto con las fallidas). */
  onPartial?: (relations: Relation[]) => void;
  /** Se llama al terminar (aunque alguna haya fallado, con las que sí se crearon). */
  onSaved: (relations: Relation[]) => void;
};

type Candidate = RelationRef & { name: string; image: string; frame: NpcImageFrame | null; hint: string };

const KINDS: RelationKind[] = ['champion', 'npc'];

/** Admin: elige uno o varios campeones/NPCs (búsqueda, se pueden mezclar) y una nota opcional común para relacionarlos con la ficha abierta. */
const RelationAddModal = ({ self, selfName, existing, onClose, onSaved, onPartial }: Props) => {
  const [kind, setKind] = useState<RelationKind>(self.kind === 'npc' ? 'npc' : 'champion');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Candidate[]>([]);
  const [note, setNote] = useState('');
  const [visibleToPlayers, setVisibleToPlayers] = useState(false);
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

  const isPicked = (candidate: RelationRef) => picked.some(p => sameRelationRef(p, candidate));
  const countOf = (option: RelationKind) => picked.filter(p => p.kind === option).length;
  const shownFree = shown.filter(c => !isPicked(c));
  const toggle = (candidate: Candidate) =>
    setPicked(prev => (prev.some(p => sameRelationRef(p, candidate))
      ? prev.filter(p => !sameRelationRef(p, candidate))
      : [...prev, candidate]));
  const selectAllShown = () => setPicked(prev => [...prev, ...shownFree]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (picked.length === 0) {
      setError('Elige al menos un campeón o NPC');
      return;
    }
    setSaving(true);
    setError(null);
    const text = note.trim();
    const created: Relation[] = [];
    const failed: Candidate[] = [];
    let lastError = '';
    // Una a una en orden (la API crea de una en una); si alguna falla, se siguen las demás.
    for (const candidate of picked) {
      try {
        created.push(await createRelation(self, { kind: candidate.kind, id: candidate.id }, text, visibleToPlayers));
      } catch (caught) {
        failed.push(candidate);
        lastError = caught instanceof Error ? caught.message : 'No se pudo crear la relación';
      }
    }
    if (failed.length === 0) {
      onSaved(created);
      return;
    }
    // Se quedan seleccionadas solo las que fallaron, para reintentar.
    setPicked(failed);
    setError(`No se pudieron añadir ${failed.map(c => c.name).join(', ')}: ${lastError}`);
    setSaving(false);
    if (created.length > 0) onPartial?.(created);
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
              onClick={() => setKind(option)}
            >
              {option === 'champion' ? 'Campeones' : 'NPCs'}
              {countOf(option) > 0 && ` (${countOf(option)})`}
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

        <div className="rel-pick__bar">
          <span className="rel-pick__count">
            {picked.length === 0 ? 'Nada seleccionado' : `${picked.length} seleccionado${picked.length === 1 ? '' : 's'}`}
          </span>
          <button type="button" className="calc-ability-edit" disabled={shownFree.length === 0} onClick={selectAllShown}>
            Marcar todos
          </button>
          <button type="button" className="calc-ability-edit" disabled={picked.length === 0} onClick={() => setPicked([])}>
            Limpiar
          </button>
        </div>

        {picked.length > 0 && (
          <div className="rel-pick__chips">
            {picked.map(candidate => (
              <button
                key={`${candidate.kind}:${candidate.id}`}
                type="button"
                className="rel-pick__chip"
                title="Quitar de la selección"
                onClick={() => toggle(candidate)}
              >
                {candidate.name} ×
              </button>
            ))}
          </div>
        )}

        <div className="rel-pick" role="listbox" aria-multiselectable="true" aria-label="Candidatos">
          {kind === 'npc' && npcs === null && !error && <p className="calc-build-empty">Cargando NPCs…</p>}
          {(kind === 'champion' || npcs !== null) && shown.length === 0 && (
            <p className="calc-build-empty">No hay {kind === 'champion' ? 'campeones' : 'NPCs'} que añadir.</p>
          )}
          {shown.map(candidate => {
            const on = isPicked(candidate);
            return (
              <button
                key={`${candidate.kind}:${candidate.id}`}
                type="button"
                role="option"
                aria-selected={on}
                className={cx('rel-pick__row', on && 'rel-pick__row--on')}
                onClick={() => toggle(candidate)}
              >
                <span className={cx('rel-pick__check', on && 'rel-pick__check--on')} aria-hidden="true">{on ? '✓' : ''}</span>
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
          <span>Nota (opcional, se aplica a todas)</span>
          <input
            type="text"
            maxLength={RELATION_NOTE_MAX}
            value={note}
            placeholder="Hermano, rival, mentor, le debe un favor…"
            onChange={e => setNote(e.target.value)}
          />
        </label>

        <label className="rel-visible-check">
          <input type="checkbox" checked={visibleToPlayers} onChange={e => setVisibleToPlayers(e.target.checked)} />
          <span>Visible para players</span>
        </label>

        {error && <p className="hab-modal__error" role="alert">{error}</p>}

        <div className="hab-modal__actions">
          <button type="submit" className="hab-modal__btn" disabled={saving || picked.length === 0}>
            {saving
              ? 'Guardando…'
              : picked.length === 0
                ? 'Relacionar'
                : picked.length === 1
                  ? `Relacionar con ${picked[0].name}`
                  : `Añadir ${picked.length} relaciones`}
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
