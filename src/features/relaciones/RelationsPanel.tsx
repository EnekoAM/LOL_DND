import ThumbImg from '../../components/ThumbImg';
import { portraitThumbWidth } from '../../lib/thumb';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCanEdit } from '../../data/appRoleContext';
import { useLiveRevision } from '../../data/live';
import { npcImageStyle } from '../../data/npcs';
import {
  RELATION_KIND_LABEL,
  RELATION_SCREEN_PATH,
  deleteRelation,
  loadRelations,
  openRelatedSheet,
  updateRelation,
  type Relation,
  type RelationKind,
  type RelationRef,
} from '../../data/relations';
import RelationAddModal from './RelationAddModal';
import RelationNoteModal from './RelationNoteModal';
import './Relations.css';

type Props = {
  /** Ficha abierta. */
  self: RelationRef;
  selfName: string;
};

const GROUPS: { kind: RelationKind; title: string; empty: string }[] = [
  { kind: 'champion', title: 'Campeones', empty: 'Sin campeones relacionados.' },
  { kind: 'npc', title: 'NPCs y Monstruos', empty: 'Sin NPCs relacionados.' },
];

/**
 * Pestaña «Relaciones» de las fichas de campeón y NPC. Admin: añade, cambia la nota y quita.
 * Visibilidad por relación: el admin marca cuáles ven los players (👁). Players: solo esas y con fichas visibles (lo filtra la API).
 */
const RelationsPanel = ({ self, selfName }: Props) => {
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const revision = useLiveRevision('relations', 'npcs', 'champions');
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Relation | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadRelations(self)
      .then(next => {
        if (!active) return;
        setRelations(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'No se pudieron cargar las relaciones');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [self.kind, self.id, revision, canEdit, reload]);

  useEffect(() => {
    setAdding(false);
    setEditing(null);
    setConfirmId(null);
  }, [self.kind, self.id]);

  const open = (relation: Relation) => {
    const ref: RelationRef = { kind: relation.other.kind, id: relation.other.id };
    openRelatedSheet(ref);
    navigate(RELATION_SCREEN_PATH[ref.kind]);
  };

  const toggleVisible = async (relation: Relation) => {
    const next = !relation.visibleToPlayers;
    setBusyId(relation.id);
    setError(null);
    try {
      await updateRelation(relation.id, { visibleToPlayers: next });
      setRelations(prev => prev.map(r => (r.id === relation.id ? { ...r, visibleToPlayers: next } : r)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cambiar la visibilidad');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (relation: Relation) => {
    setBusyId(relation.id);
    setError(null);
    try {
      await deleteRelation(relation.id);
      setRelations(prev => prev.filter(r => r.id !== relation.id));
      setConfirmId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo quitar la relación');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="sheet-panel rel-panel">
      <div className="sheet-panel__title">
        Relaciones
        <span className="sheet-panel__meta">{relations.length}</span>
        {canEdit && (
          <button type="button" className="calc-ability-edit rel-panel__add" onClick={() => setAdding(true)}>
            + Añadir relación
          </button>
        )}
      </div>

      {error && <p className="sheet-hp__error" role="alert">{error}</p>}
      {loading && relations.length === 0 && !error && <p className="calc-build-empty">Cargando relaciones…</p>}
      {!loading && relations.length === 0 && !error && (
        <p className="calc-build-empty">
          {canEdit ? 'Todavía no tiene relaciones. Añade campeones o NPCs con «+ Añadir relación».' : 'Sin relaciones conocidas.'}
        </p>
      )}

      {relations.length > 0 && GROUPS.map(group => {
        const list = relations.filter(r => r.other.kind === group.kind);
        if (list.length === 0) return null;
        return (
          <div key={group.kind} className="rel-group">
            <div className="rel-group__title">{group.title}</div>
            <div className="rel-grid">
              {list.map(relation => (
                <div key={relation.id} className={`rel-card${canEdit && !relation.visibleToPlayers ? ' rel-card--private' : ''}`}>
                  <button
                    type="button"
                    className="rel-card__main"
                    title={`Abrir ficha de ${relation.other.name}`}
                    onClick={() => open(relation)}
                  >
                    <span className="calc-champ-card__portrait rel-card__portrait">
                      {relation.other.image
                        ? <ThumbImg src={relation.other.image} thumbWidth={relation.other.kind === 'npc' ? portraitThumbWidth(relation.other.imageFrame?.zoom) : undefined} style={npcImageStyle(relation.other.imageFrame)} />
                        : <span aria-hidden="true">{relation.other.name.charAt(0)}</span>}
                    </span>
                    <span className="rel-card__text">
                      <span className="rel-card__name">{relation.other.name}</span>
                      <span className="rel-card__kind">
                        {RELATION_KIND_LABEL[relation.other.kind]}
                        {canEdit && !relation.other.visible && (
                          <span className="rel-card__hidden">{relation.other.kind === 'champion' ? ' · Inactivo' : ' · Oculto'}</span>
                        )}
                      </span>
                      {relation.note && <span className="rel-card__note">{relation.note}</span>}
                    </span>
                  </button>
                  {canEdit && (
                    <div className="rel-card__actions">
                      {confirmId === relation.id ? (
                        <>
                          <button
                            type="button"
                            className="calc-ability-edit rel-btn--danger"
                            disabled={busyId === relation.id}
                            onClick={() => { void remove(relation); }}
                          >
                            {busyId === relation.id ? 'Quitando…' : 'Sí, quitar'}
                          </button>
                          <button type="button" className="calc-ability-edit" disabled={busyId === relation.id} onClick={() => setConfirmId(null)}>
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`calc-ability-edit rel-btn--visible${relation.visibleToPlayers ? ' rel-btn--visible-on' : ''}`}
                            disabled={busyId === relation.id}
                            aria-pressed={relation.visibleToPlayers}
                            title={relation.visibleToPlayers
                              ? 'Los players ven esta relación (si las dos fichas son visibles). Clic para ocultarla.'
                              : 'Los players no ven esta relación. Clic para mostrarla.'}
                            onClick={() => { void toggleVisible(relation); }}
                          >
                            {relation.visibleToPlayers ? '👁 Visible' : '🚫 Oculta'}
                          </button>
                          <button type="button" className="calc-ability-edit" onClick={() => setEditing(relation)}>✎ Nota</button>
                          <button type="button" className="calc-ability-edit" onClick={() => setConfirmId(relation.id)}>Quitar</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {adding && canEdit && (
        <RelationAddModal
          self={self}
          selfName={selfName}
          existing={relations}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setReload(n => n + 1);
          }}
          onPartial={() => setReload(n => n + 1)}
        />
      )}

      {editing && canEdit && (
        <RelationNoteModal
          title={`${selfName} ↔ ${editing.other.name}`}
          initial={editing.note}
          initialVisible={editing.visibleToPlayers}
          onClose={() => setEditing(null)}
          onSubmit={async (note, visibleToPlayers) => {
            await updateRelation(editing.id, { note, visibleToPlayers });
            setRelations(prev => prev.map(r => (r.id === editing.id ? { ...r, note, visibleToPlayers } : r)));
            setEditing(null);
          }}
        />
      )}
    </section>
  );
};

export default RelationsPanel;
