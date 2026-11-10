import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/Modal';
import {
  NPC_DEFAULT_FRAME,
  NPC_DESCRIPTION_MAX,
  NPC_KINDS,
  NPC_LEVEL_MAX,
  NPC_LEVEL_MIN,
  NPC_NAME_MAX,
  NPC_STATS,
  NPC_TAG_MAX,
  NPC_ZOOM_MAX,
  NPC_ZOOM_MIN,
  isDefaultFrame,
  npcImageStyle,
  type NpcImageFrame,
  type NpcInput,
  type NpcKind,
  type NpcStatKey,
  type NpcStats,
} from '../../data/npcs';
import { cx } from '../../lib/cx';

type Props = {
  title: string;
  initial: NpcInput;
  /** Sugerencias para tipo/región (los que ya existen). */
  types: string[];
  regions: string[];
  submitLabel: string;
  onClose: () => void;
  onSubmit: (input: NpcInput) => Promise<void>;
};

type StatDraft = Record<NpcStatKey, string>;

const toStatDraft = (stats: NpcStats): StatDraft =>
  Object.fromEntries(NPC_STATS.map(({ key }) => [key, stats[key] === undefined ? '' : String(stats[key])])) as StatDraft;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, step = 0.5) => Math.round(value / step) * step;

type FrameTarget = 'square' | 'circle';
type DragState = { pointerId: number; which: FrameTarget; startX: number; startY: number; frame: NpcImageFrame; width: number; height: number };
type FrameSet = { square: NpcImageFrame; circle: NpcImageFrame; linked: boolean };

/**
 * Vista previa de la foto (ficha cuadrada + tarjeta circular) con encuadre arrastrable, sliders y zoom.
 * Vinculadas: un encuadre para las dos. Desvinculadas: cada vista tiene el suyo.
 */
const PortraitFramer = ({ url, name, square, circle, linked, onChange }: FrameSet & {
  url: string;
  name: string;
  onChange: (next: FrameSet) => void;
}) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [target, setTarget] = useState<FrameTarget>('square');
  const drag = useRef<DragState | null>(null);
  const failed = failedUrl === url;
  const circleFrame = linked ? square : circle;
  const active: FrameTarget = linked ? 'square' : target;
  const current = active === 'circle' ? circleFrame : square;

  const setFrame = (which: FrameTarget, frame: NpcImageFrame) => {
    if (linked) onChange({ square: frame, circle: frame, linked });
    else if (which === 'circle') onChange({ square, circle: frame, linked });
    else onChange({ square: frame, circle, linked });
  };
  const toggleLink = () => {
    if (linked) {
      // Al desvincular, el círculo parte del encuadre actual y ya va por libre.
      onChange({ square, circle: { ...square }, linked: false });
      setTarget('circle');
    } else {
      // Al vincular, manda el encuadre de la vista que estabas ajustando.
      const keep = target === 'circle' ? circle : square;
      onChange({ square: { ...keep }, circle: { ...keep }, linked: true });
      setTarget('square');
    }
  };

  const onPointerDown = (which: FrameTarget) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (failed) return;
    if (!linked) setTarget(which);
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      which,
      startX: event.clientX,
      startY: event.clientY,
      frame: which === 'circle' ? circleFrame : square,
      width: rect.width,
      height: rect.height,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    // Arrastrar la imagen hacia la derecha muestra más de su lado izquierdo (x baja).
    const dx = ((event.clientX - state.startX) / state.width) * 100 / state.frame.zoom;
    const dy = ((event.clientY - state.startY) / state.height) * 100 / state.frame.zoom;
    setFrame(state.which, {
      ...state.frame,
      x: round(clamp(state.frame.x - dx, 0, 100)),
      y: round(clamp(state.frame.y - dy, 0, 100)),
    });
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };
  const dragProps = (which: FrameTarget) => ({
    onPointerDown: onPointerDown(which),
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    title: failed ? undefined : 'Arrastra para mover la imagen',
  });
  const selected = (which: FrameTarget) => !linked && active === which;
  const editingLabel = linked ? 'Ficha y tarjeta (vinculadas)' : active === 'circle' ? 'Tarjeta (circular)' : 'Ficha (cuadrada)';

  return (
    <div className="hab-modal__block npc-framer">
      <span className="hab-modal__tag">Vista previa · Ajustar encuadre</span>
      <div className={cx('npc-framer__previews', linked ? 'npc-framer__previews--linked' : 'npc-framer__previews--unlinked')}>
        <div className="npc-framer__pane">
          <div
            className={cx('sheet-portrait', 'npc-framer__sheet', !failed && 'npc-framer__sheet--drag', selected('square') && 'npc-framer__target--on')}
            {...dragProps('square')}
          >
            {failed ? (
              <div className="sheet-portrait__placeholder npc-framer__error">No se pudo cargar la imagen</div>
            ) : (
              <img
                className="sheet-portrait__img"
                src={url}
                alt={name}
                draggable={false}
                style={npcImageStyle(square)}
                onError={() => setFailedUrl(url)}
                onLoad={() => setFailedUrl(null)}
              />
            )}
          </div>
          <span className="npc-framer__label">Ficha (cuadrada)</span>
        </div>

        <div className="npc-framer__linkcol">
          <span className="npc-framer__chain" aria-hidden="true" />
          <button
            type="button"
            className={cx('npc-framer__link', linked && 'npc-framer__link--on')}
            aria-pressed={linked}
            onClick={toggleLink}
            title={linked ? 'Ahora un encuadre mueve las dos. Pulsa para ajustarlas por separado.' : 'Ahora van por separado. Pulsa para usar el mismo encuadre en las dos.'}
          >
            <span className="npc-framer__link-icon" aria-hidden="true">🔗</span>
            <span className="npc-framer__link-state">{linked ? 'Vinculadas' : 'Desvinculadas'}</span>
            <span className="npc-framer__link-action">{linked ? 'Desvincular' : 'Vincular'}</span>
          </button>
          <span className="npc-framer__chain" aria-hidden="true" />
        </div>

        <div className="npc-framer__pane">
          <div
            className={cx('calc-champ-card__portrait', 'npc-framer__card', !failed && 'npc-framer__card--drag', selected('circle') && 'npc-framer__target--on')}
            aria-label="Vista en la tarjeta"
            {...dragProps('circle')}
          >
            {!failed && <img src={url} alt="" draggable={false} style={npcImageStyle(circleFrame)} />}
          </div>
          <span className="npc-framer__label">Tarjeta (circular)</span>
        </div>
      </div>

      <span className="npc-framer__hint">
        {linked
          ? 'Arrastra cualquiera de las dos: el encuadre se aplica a ambas.'
          : 'Arrastra cada imagen o elige cuál ajustar con los sliders; no se afectan entre sí.'}
      </span>

      {!linked && (
        <div className="npc-kind-switch npc-framer__targets" role="radiogroup" aria-label="Vista a ajustar">
          {(['square', 'circle'] as const).map(which => (
            <button
              key={which}
              type="button"
              role="radio"
              aria-checked={active === which}
              className={cx('npc-kind-switch__btn', active === which && 'npc-kind-switch__btn--on')}
              onClick={() => setTarget(which)}
            >
              {which === 'square' ? '▢ Ficha' : '◯ Tarjeta'}
            </button>
          ))}
        </div>
      )}

      <div className="npc-framer__controls">
        <span className="npc-framer__editing">Ajustando: <strong>{editingLabel}</strong></span>
        <label className="npc-framer__slider">
          <span>Horizontal</span>
          <input type="range" min={0} max={100} step={0.5} value={current.x} onChange={e => setFrame(active, { ...current, x: Number(e.target.value) })} />
          <output>{Math.round(current.x)}%</output>
        </label>
        <label className="npc-framer__slider">
          <span>Vertical</span>
          <input type="range" min={0} max={100} step={0.5} value={current.y} onChange={e => setFrame(active, { ...current, y: Number(e.target.value) })} />
          <output>{Math.round(current.y)}%</output>
        </label>
        <label className="npc-framer__slider">
          <span>Zoom</span>
          <input type="range" min={NPC_ZOOM_MIN} max={NPC_ZOOM_MAX} step={0.05} value={current.zoom} onChange={e => setFrame(active, { ...current, zoom: Number(e.target.value) })} />
          <output>{current.zoom.toFixed(2)}×</output>
        </label>
        <button
          type="button"
          className="hab-modal__btn hab-modal__btn--ghost npc-framer__reset"
          disabled={isDefaultFrame(current)}
          onClick={() => setFrame(active, { ...NPC_DEFAULT_FRAME })}
        >
          Centrar
        </button>
      </div>
    </div>
  );
};

/** Alta / edición de los datos del NPC (las habilidades se editan desde la ficha). */
const NpcEditorModal = ({ title, initial, types, regions, submitLabel, onClose, onSubmit }: Props) => {
  const [draft, setDraft] = useState<NpcInput>(initial);
  const [frames, setFrames] = useState<FrameSet>(() => {
    const square = initial.imageFrame ?? { ...NPC_DEFAULT_FRAME };
    // NPCs sin imageFrameCircle (los antiguos incluidos) quedan vinculados.
    return initial.imageFrameCircle
      ? { square, circle: initial.imageFrameCircle, linked: false }
      : { square, circle: square, linked: true };
  });
  const [stats, setStats] = useState<StatDraft>(() => toStatDraft(initial.stats));
  const [level, setLevel] = useState(String(initial.level));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bgFailedUrl, setBgFailedUrl] = useState<string | null>(null);

  const change = (patch: Partial<NpcInput>) => setDraft(current => ({ ...current, ...patch }));
  const imageUrl = draft.image.trim();
  const backgroundUrl = draft.background?.trim() || '';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const name = draft.name.trim();
    if (!name) {
      setError('Pon un nombre al NPC');
      return;
    }
    const parsedLevel = Number(level);
    if (!Number.isInteger(parsedLevel) || parsedLevel < NPC_LEVEL_MIN || parsedLevel > NPC_LEVEL_MAX) {
      setError(`El nivel tiene que ser un entero entre ${NPC_LEVEL_MIN} y ${NPC_LEVEL_MAX}`);
      return;
    }
    const nextStats: NpcStats = {};
    for (const { key, label } of NPC_STATS) {
      const raw = stats[key].trim().replace(',', '.');
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        setError(`${label} tiene que ser un número`);
        return;
      }
      nextStats[key] = value;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        ...draft,
        name,
        type: draft.type.trim(),
        region: draft.region.trim(),
        image: imageUrl,
        imageFrame: imageUrl && !isDefaultFrame(frames.square) ? frames.square : null,
        imageFrameCircle: imageUrl && !frames.linked ? frames.circle : null,
        background: backgroundUrl || null,
        description: draft.description.trim(),
        publicNotes: (draft.publicNotes ?? '').trim(),
        level: parsedLevel,
        stats: nextStats,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
      setSaving(false);
    }
  };

  return createPortal(
    <Modal onClose={() => { if (!saving) onClose(); }} backdropClassName="hab-modal-backdrop" className="hab-modal npc-editor">
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
      <form className="hab-modal__body" onSubmit={e => { void submit(e); }}>
        <h2 className="hab-modal__title">{title}</h2>

        <div className="npc-kind-switch" role="radiogroup" aria-label="Clase">
          {NPC_KINDS.map(kind => (
            <button
              key={kind.value}
              type="button"
              role="radio"
              aria-checked={draft.kind === kind.value}
              className={cx('npc-kind-switch__btn', draft.kind === kind.value && 'npc-kind-switch__btn--on')}
              onClick={() => change({ kind: kind.value as NpcKind })}
            >
              {kind.icon} {kind.label}
            </button>
          ))}
        </div>

        <label className="hab-field">
          <span>Nombre</span>
          <input value={draft.name} autoFocus maxLength={NPC_NAME_MAX} onChange={e => change({ name: e.target.value })} />
        </label>

        <div className="npc-editor__row">
          <label className="hab-field">
            <span>Tipo</span>
            <input value={draft.type} list="npc-types" maxLength={NPC_TAG_MAX} placeholder="Bestia, Mercader, Jefe…" onChange={e => change({ type: e.target.value })} />
            <datalist id="npc-types">{types.map(t => <option key={t} value={t} />)}</datalist>
          </label>
          <label className="hab-field">
            <span>Región</span>
            <input value={draft.region} list="npc-regions" maxLength={NPC_TAG_MAX} placeholder="Demacia, Freljord…" onChange={e => change({ region: e.target.value })} />
            <datalist id="npc-regions">{regions.map(r => <option key={r} value={r} />)}</datalist>
          </label>
          <label className="hab-field npc-editor__level">
            <span>Nivel</span>
            <input type="number" min={NPC_LEVEL_MIN} max={NPC_LEVEL_MAX} step={1} value={level} onChange={e => setLevel(e.target.value)} />
          </label>
        </div>

        <label className="hab-field">
          <span>Foto (URL)</span>
          <input type="url" value={draft.image} placeholder="https://…" onChange={e => change({ image: e.target.value })} />
        </label>
        {imageUrl && <PortraitFramer url={imageUrl} name={draft.name} {...frames} onChange={setFrames} />}

        <label className="hab-field">
          <span>Fondo de la ficha (URL, opcional)</span>
          <input type="url" value={draft.background ?? ''} placeholder="https://…" onChange={e => change({ background: e.target.value })} />
        </label>
        {backgroundUrl && (
          <div className="npc-framer__bg" aria-label="Vista previa del fondo">
            {bgFailedUrl === backgroundUrl ? (
              <span className="npc-framer__error">No se pudo cargar el fondo</span>
            ) : (
              <img src={backgroundUrl} alt="" onError={() => setBgFailedUrl(backgroundUrl)} onLoad={() => setBgFailedUrl(null)} />
            )}
          </div>
        )}

        <label className="hab-field">
          <span>Descripción / trasfondo</span>
          <textarea rows={4} maxLength={NPC_DESCRIPTION_MAX} value={draft.description} onChange={e => change({ description: e.target.value })} />
        </label>

        <label className="hab-field">
          <span>Notas públicas (visibles a la party)</span>
          <textarea rows={3} maxLength={NPC_DESCRIPTION_MAX} value={draft.publicNotes ?? ''} onChange={e => change({ publicNotes: e.target.value })} />
        </label>

        <div className="hab-modal__block">
          <span className="hab-modal__tag">Estadísticas (vacío = no se muestra)</span>
          <div className="npc-editor__stats">
            {NPC_STATS.map(({ key, label, title: statTitle }) => (
              <label key={key} className="hab-field" title={statTitle}>
                <span>{label}</span>
                <input inputMode="decimal" value={stats[key]} onChange={e => setStats(current => ({ ...current, [key]: e.target.value }))} />
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          className={cx('hab-learned', draft.visible && 'hab-learned--on')}
          aria-pressed={draft.visible}
          onClick={() => change({ visible: !draft.visible })}
        >
          <span>Visible para players</span>
          <span className="hab-learned__switch" aria-hidden="true" />
        </button>

        {error && <p className="hab-modal__error" role="alert">{error}</p>}

        <div className="hab-modal__actions">
          <button type="submit" className="hab-modal__btn" disabled={saving}>
            {saving ? 'Guardando…' : submitLabel}
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

export default NpcEditorModal;
