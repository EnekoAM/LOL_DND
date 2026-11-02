import { useEffect, useState } from 'react';
import { cx } from '../../lib/cx';
import {
  MAP_POI_KIND_LABEL,
  MAP_POI_NAME_MAX,
  MAP_POI_NOTE_MAX,
  type MapPoi,
  type MapPoiDraft,
  type MapPoiKind,
} from '../../data/mapPois';

export type PoiFormDraft = MapPoiDraft;

type Props = {
  /** Punto nuevo a medio crear (ya tiene posición). */
  draft: PoiFormDraft | null;
  /** Punto ya guardado que se está mirando. */
  selected: MapPoi | null;
  /** Ubicación actual de la party (única), para avisar de que se moverá. */
  party: MapPoi | null;
  isAdmin: boolean;
  busy: boolean;
  error: string | null;
  onDraftChange: (draft: PoiFormDraft) => void;
  onSaveDraft: (draft: PoiFormDraft) => void;
  onCancelDraft: () => void;
  onRepick: () => void;
  onSaveDetails: (id: string, patch: { name?: string; note?: string | null }) => void;
  onMove: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

const KIND_OPTIONS: { value: MapPoiKind; hint: string }[] = [
  { value: 'poi', hint: 'Un sitio con nombre: pueden ser varios.' },
  { value: 'party', hint: 'Dónde está ahora la party. Solo hay una.' },
];

const coords = (poi: { x: number; y: number }) => `${Math.round(poi.x)}, ${Math.round(poi.y)}`;

/** Panel flotante del mapa: crear un punto, ver uno o (admin) editarlo, moverlo y borrarlo. */
export default function MapaPoiPanel({
  draft,
  selected,
  party,
  isAdmin,
  busy,
  error,
  onDraftChange,
  onSaveDraft,
  onCancelDraft,
  onRepick,
  onSaveDetails,
  onMove,
  onDelete,
  onClose,
}: Props) {
  if (draft) {
    const isParty = draft.kind === 'party';
    const nameMissing = !isParty && !draft.name.trim();
    return (
      <aside className="mapa-panel" aria-label="Nuevo punto">
        <div className="mapa-panel__head">
          <span className="mapa-panel__title">Nuevo punto</span>
          <button type="button" className="mapa-panel__close" aria-label="Cancelar" disabled={busy} onClick={onCancelDraft}>×</button>
        </div>
        <div className="mapa-panel__kinds" role="radiogroup" aria-label="Tipo de punto">
          {KIND_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={draft.kind === option.value}
              className={cx('mapa-panel__kind', `mapa-panel__kind--${option.value}`, draft.kind === option.value && 'mapa-panel__kind--on')}
              disabled={busy}
              onClick={() => onDraftChange({ ...draft, kind: option.value })}
            >
              <span className="mapa-panel__kind-label">
                {option.value === 'party' ? '\u{1F6A9} ' : '\u{1F4CD} '}
                {MAP_POI_KIND_LABEL[option.value]}
              </span>
              <span className="mapa-panel__kind-hint">{option.hint}</span>
            </button>
          ))}
        </div>
        {isParty && party && (
          <p className="mapa-panel__warn">
            Ya hay una ubicación de la party («{party.name}»). Solo puede haber una: al guardar se moverá aquí.
          </p>
        )}
        <label className="mapa-panel__field">
          <span className="mapa-panel__label">Nombre{isParty ? ' (opcional)' : ''}</span>
          <input
            className="mapa-panel__input"
            value={draft.name}
            maxLength={MAP_POI_NAME_MAX}
            placeholder={isParty ? party?.name ?? 'Party' : 'p. ej. Cueva del dragón'}
            disabled={busy}
            autoFocus
            onChange={event => onDraftChange({ ...draft, name: event.target.value })}
          />
        </label>
        <label className="mapa-panel__field">
          <span className="mapa-panel__label">Nota (opcional)</span>
          <textarea
            className="mapa-panel__input mapa-panel__textarea"
            value={draft.note}
            maxLength={MAP_POI_NOTE_MAX}
            rows={3}
            disabled={busy}
            onChange={event => onDraftChange({ ...draft, note: event.target.value })}
          />
        </label>
        <div className="mapa-panel__meta">Posición {coords(draft)}</div>
        {error && <p className="mapa-panel__error" role="alert">{error}</p>}
        <div className="mapa-panel__actions">
          <button
            type="button"
            className="mapa-action mapa-action--primary"
            disabled={busy || nameMissing}
            title={nameMissing ? 'Ponle un nombre al punto' : undefined}
            onClick={() => onSaveDraft({ ...draft, name: draft.name.trim() || (isParty ? party?.name ?? 'Party' : '') })}
          >
            {isParty && party ? 'Mover la party aquí' : 'Guardar'}
          </button>
          <button type="button" className="mapa-action" disabled={busy} onClick={onRepick}>Recolocar</button>
          <button type="button" className="mapa-action" disabled={busy} onClick={onCancelDraft}>Cancelar</button>
        </div>
      </aside>
    );
  }

  if (!selected) {
    return error ? (
      <aside className="mapa-panel mapa-panel--error" aria-label="Error del mapa">
        <div className="mapa-panel__head">
          <span className="mapa-panel__title">Puntos propios</span>
          <button type="button" className="mapa-panel__close" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <p className="mapa-panel__error" role="alert">{error}</p>
      </aside>
    ) : null;
  }

  return (
    <SelectedPanel
      poi={selected}
      isAdmin={isAdmin}
      busy={busy}
      error={error}
      onSave={patch => onSaveDetails(selected.id, patch)}
      onMove={() => onMove(selected.id)}
      onDelete={() => onDelete(selected.id)}
      onClose={onClose}
    />
  );
}

type SelectedProps = {
  poi: MapPoi;
  isAdmin: boolean;
  busy: boolean;
  error: string | null;
  onSave: (patch: { name?: string; note?: string | null }) => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
};

const SelectedPanel = ({ poi, isAdmin, busy, error, onSave, onMove, onDelete, onClose }: SelectedProps) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(poi.name);
  const [note, setNote] = useState(poi.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isParty = poi.kind === 'party';

  useEffect(() => {
    setName(poi.name);
    setNote(poi.note ?? '');
  }, [poi.name, poi.note]);

  const save = () => {
    const nextName = name.trim();
    if (!nextName) return;
    const patch: { name?: string; note?: string | null } = {};
    if (nextName !== poi.name) patch.name = nextName;
    if (note.trim() !== (poi.note ?? '')) patch.note = note.trim() || null;
    if (Object.keys(patch).length) onSave(patch);
    setEditing(false);
  };

  return (
    <aside className={cx('mapa-panel', isParty && 'mapa-panel--party')} aria-label={poi.name}>
      <div className="mapa-panel__head">
        <span className="mapa-panel__kind-tag">
          {isParty ? '\u{1F6A9} ' : '\u{1F4CD} '}
          {MAP_POI_KIND_LABEL[poi.kind]}
        </span>
        <button type="button" className="mapa-panel__close" aria-label="Cerrar" onClick={onClose}>×</button>
      </div>
      {editing ? (
        <>
          <label className="mapa-panel__field">
            <span className="mapa-panel__label">Nombre</span>
            <input
              className="mapa-panel__input"
              value={name}
              maxLength={MAP_POI_NAME_MAX}
              disabled={busy}
              autoFocus
              onChange={event => setName(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') save(); }}
            />
          </label>
          <label className="mapa-panel__field">
            <span className="mapa-panel__label">Nota</span>
            <textarea
              className="mapa-panel__input mapa-panel__textarea"
              value={note}
              maxLength={MAP_POI_NOTE_MAX}
              rows={3}
              disabled={busy}
              onChange={event => setNote(event.target.value)}
            />
          </label>
        </>
      ) : (
        <>
          <div className="mapa-panel__title">{poi.name}</div>
          {poi.note ? <p className="mapa-panel__note">{poi.note}</p> : <p className="mapa-panel__empty">Sin nota.</p>}
        </>
      )}
      {isAdmin && <div className="mapa-panel__meta">Posición {coords(poi)} · arrastra el pin para moverlo</div>}
      {error && <p className="mapa-panel__error" role="alert">{error}</p>}
      {isAdmin && (
        <div className="mapa-panel__actions">
          {editing ? (
            <>
              <button type="button" className="mapa-action mapa-action--primary" disabled={busy || !name.trim()} onClick={save}>Guardar</button>
              <button
                type="button"
                className="mapa-action"
                disabled={busy}
                onClick={() => {
                  setName(poi.name);
                  setNote(poi.note ?? '');
                  setEditing(false);
                }}
              >
                Cancelar
              </button>
            </>
          ) : confirmDelete ? (
            <>
              <span className="mapa-panel__confirm">¿Borrar este punto?</span>
              <button type="button" className="mapa-action mapa-action--danger" disabled={busy} onClick={onDelete}>Sí, borrar</button>
              <button type="button" className="mapa-action" disabled={busy} onClick={() => setConfirmDelete(false)}>No</button>
            </>
          ) : (
            <>
              <button type="button" className="mapa-action" disabled={busy} onClick={() => setEditing(true)}>Editar</button>
              <button type="button" className="mapa-action" disabled={busy} onClick={onMove}>Mover</button>
              <button type="button" className="mapa-action mapa-action--danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Borrar</button>
            </>
          )}
        </div>
      )}
    </aside>
  );
};
