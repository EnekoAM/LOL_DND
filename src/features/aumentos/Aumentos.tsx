import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import Modal from '../../components/Modal';
import { useCanEdit } from '../../data/appRoleContext';
import {
  AUGMENT_DESCRIPTION_MAX,
  AUGMENT_LEVEL_COUNT,
  AUGMENT_LEVEL_EFFECT_MAX,
  AUGMENT_NAME_MAX,
  AUGMENT_RARITIES,
  rarityLabel,
  type AugmentRarity,
  createAugment,
  deleteAugment,
  loadAugments,
  pickAugments,
  rollRarity,
  updateAugment,
  type Augment,
  type AugmentDraft,
} from '../../data/augments';
import { useLiveRevision } from '../../data/live';
import {
  partyAumentoRoll,
  partyAumentosForPlayers,
  saveAumentoRoll,
  saveAumentosForPlayers,
  subscribeParty,
  type AumentoRoll,
} from '../../data/party';
import AugmentLevelList, { AugmentLevelBadge } from './AugmentLevels';
import './Aumentos.css';

/** Borrador del formulario: los 3 efectos se guardan aunque se apague «Con niveles» (por si se vuelve a encender). */
type FormDraft = { rarity: AugmentRarity; name: string; description: string; leveled: boolean; levels: string[] };

const EMPTY_LEVELS = (): string[] => Array.from({ length: AUGMENT_LEVEL_COUNT }, () => '');

const EMPTY_DRAFT: FormDraft = { rarity: 'plata', name: '', description: '', leveled: false, levels: EMPTY_LEVELS() };

const sortByName = (list: Augment[]): Augment[] =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

const formatGold = (value: number) => value.toLocaleString('es-ES');

type Editing = { id: string | null; draft: FormDraft };

/** Resultado de la ruleta: rareza que tocó y hasta 3 aumentos de esa rareza. */
type RollResult = { rarity: AugmentRarity; options: Augment[] };

type RollDraft = { plata: string; oro: string; prismatico: string; cost: string };

const toRollDraft = (roll: AumentoRoll): RollDraft => ({
  plata: String(roll.probs.plata),
  oro: String(roll.probs.oro),
  prismatico: String(roll.probs.prismatico),
  cost: String(roll.cost),
});

const draftInt = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : NaN;
};

const Aumentos = () => {
  const isAdmin = useCanEdit();
  const forPlayers = useSyncExternalStore(subscribeParty, partyAumentosForPlayers);
  const roll = useSyncExternalStore(subscribeParty, partyAumentoRoll);
  const [rollDraft, setRollDraft] = useState<RollDraft | null>(null);
  const [rollSaving, setRollSaving] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);
  const [rollResult, setRollResult] = useState<RollResult | null>(null);
  const [augments, setAugments] = useState<Augment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Augment | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  // Aumentos creados/editados/borrados en otra pestaña: se vuelve a pedir la lista.
  const revision = useLiveRevision('augments');

  useEffect(() => {
    let active = true;
    loadAugments()
      .then(next => {
        if (!active) return;
        setAugments(sortByName(next));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los aumentos');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  const toggleForPlayers = async () => {
    if (!isAdmin || toggleBusy) return;
    setToggleBusy(true);
    setToggleError(null);
    try {
      await saveAumentosForPlayers(!forPlayers);
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : 'No se pudo cambiar la visibilidad');
    } finally {
      setToggleBusy(false);
    }
  };

  const rollTotal = rollDraft
    ? AUGMENT_RARITIES.reduce((sum, r) => sum + (draftInt(rollDraft[r.value]) || 0), 0)
    : 100;

  const saveRoll = async (event: FormEvent) => {
    event.preventDefault();
    if (!rollDraft || rollSaving) return;
    const probs = {
      plata: draftInt(rollDraft.plata),
      oro: draftInt(rollDraft.oro),
      prismatico: draftInt(rollDraft.prismatico),
    };
    const cost = draftInt(rollDraft.cost || '0');
    if (Object.values(probs).some(p => !Number.isInteger(p) || p < 0 || p > 100)) {
      setRollError('Cada probabilidad tiene que ser un entero de 0 a 100');
      return;
    }
    if (probs.plata + probs.oro + probs.prismatico !== 100) {
      setRollError(`Las probabilidades tienen que sumar 100 (ahora ${probs.plata + probs.oro + probs.prismatico})`);
      return;
    }
    if (!Number.isInteger(cost) || cost < 0) {
      setRollError('El coste tiene que ser un entero de 0 o más');
      return;
    }
    setRollSaving(true);
    setRollError(null);
    try {
      await saveAumentoRoll({ probs, cost });
      setRollDraft(null);
    } catch (error) {
      setRollError(error instanceof Error ? error.message : 'No se pudo guardar la ruleta');
    } finally {
      setRollSaving(false);
    }
  };

  /** Solo admin: simula una tirada (no gasta oro ni guarda nada). */
  const simulateRoll = () => {
    const rarity = rollRarity(roll.probs);
    setRollResult({ rarity, options: pickAugments(augments, rarity, 3) });
  };

  const countByRarity = (rarity: AugmentRarity) => augments.filter(a => a.rarity === rarity).length;

  const openNew = () => {
    setFormError(null);
    setEditing({ id: null, draft: { ...EMPTY_DRAFT, levels: EMPTY_LEVELS() } });
  };

  const openEdit = (augment: Augment) => {
    setFormError(null);
    setEditing({
      id: augment.id,
      draft: {
        rarity: augment.rarity,
        name: augment.name,
        description: augment.description,
        leveled: Boolean(augment.levels),
        levels: augment.levels ? [...augment.levels] : EMPTY_LEVELS(),
      },
    });
  };

  const setDraft = (patch: Partial<FormDraft>) =>
    setEditing(current => (current ? { ...current, draft: { ...current.draft, ...patch } } : current));

  const setLevelEffect = (index: number, text: string) =>
    setEditing(current =>
      current
        ? { ...current, draft: { ...current.draft, levels: current.draft.levels.map((t, i) => (i === index ? text : t)) } }
        : current,
    );

  const levelsMissing = Boolean(editing?.draft.leveled && editing.draft.levels.some(t => !t.trim()));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || saving) return;
    const draft: AugmentDraft = {
      rarity: editing.draft.rarity,
      name: editing.draft.name.trim(),
      description: editing.draft.description.trim(),
      levels: editing.draft.leveled ? editing.draft.levels.map(t => t.trim()) : null,
    };
    if (!draft.name) {
      setFormError('Pon un nombre al aumento');
      return;
    }
    const missing = draft.levels?.findIndex(t => !t) ?? -1;
    if (missing >= 0) {
      setFormError(`Falta el efecto de nivel ${missing + 1}`);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const saved = editing.id ? await updateAugment(editing.id, draft) : await createAugment(draft);
      setAugments(current => sortByName([saved, ...current.filter(item => item.id !== saved.id)]));
      setEditing(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar el aumento');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete || busyId) return;
    const augment = pendingDelete;
    setBusyId(augment.id);
    setRowError(null);
    try {
      await deleteAugment(augment.id);
      setAugments(current => current.filter(item => item.id !== augment.id));
    } catch (error) {
      setRowError({ id: augment.id, text: error instanceof Error ? error.message : 'No se pudo borrar' });
    } finally {
      setPendingDelete(null);
      setBusyId(null);
    }
  };

  return (
    <div className="aum-root">
      <header className="aum-head">
        <div className="aum-head__titles">
          <h2 className="aum-head__title">Aumentos</h2>
          <p className="aum-head__sub">
            {isAdmin
              ? 'Catálogo de aumentos. Los players los consiguen con la ruleta: sale una rareza y eligen entre 3 de esa rareza. Algunos pueden tener niveles propios (1, 2 y 3).'
              : 'Tira la ruleta: según la rareza que toque, podrás elegir entre 3 aumentos al azar de esa rareza.'}
          </p>
        </div>
        {isAdmin && (
          <div className="aum-head__actions">
            <label
              className={`aum-toggle${forPlayers ? ' aum-toggle--on' : ''}`}
              title="Muestra u oculta Aumentos en la barra lateral de los players"
            >
              <input
                type="checkbox"
                checked={forPlayers}
                disabled={toggleBusy}
                onChange={() => { void toggleForPlayers(); }}
              />
              <span className="aum-toggle__track" aria-hidden="true"><span className="aum-toggle__thumb" /></span>
              <span className="aum-toggle__label">
                {forPlayers ? 'Visible para players' : 'Oculto para players'}
              </span>
            </label>
            <button type="button" className="aum-btn" onClick={openNew}>+ Añadir aumento</button>
          </div>
        )}
      </header>
      {toggleError && <p className="aum-error">{toggleError}</p>}

      <section className="aum-roll" aria-label="Ruleta de aumentos">
        <div className="aum-roll__head">
          <h3 className="aum-roll__title">🎡 Ruleta de aumentos</h3>
          <span className="aum-roll__cost" title="Coste en oro por tirada">
            {roll.cost > 0 ? `${formatGold(roll.cost)} oro por tirada` : 'Coste por definir'}
          </span>
        </div>
        <div className="aum-roll__bar" aria-hidden="true">
          {AUGMENT_RARITIES.filter(r => roll.probs[r.value] > 0).map(r => (
            <span
              key={r.value}
              className={`aum-roll__seg aum-roll__seg--${r.value}`}
              style={{ flexGrow: roll.probs[r.value] }}
            />
          ))}
        </div>
        <ul className="aum-roll__odds">
          {AUGMENT_RARITIES.map(r => (
            <li key={r.value} className="aum-roll__odd">
              <span className={`aum-rarity aum-rarity--${r.value}`}>{r.label}</span>
              <strong>{roll.probs[r.value]}%</strong>
              <span className="aum-roll__count">{countByRarity(r.value)} en el catálogo</span>
            </li>
          ))}
        </ul>
        <p className="aum-roll__how">1. Gira la ruleta y sale una rareza. 2. Aparecen 3 aumentos al azar de esa rareza. 3. Te quedas con uno.</p>
        <div className="aum-roll__actions">
          {isAdmin ? (
            <>
              <button
                type="button"
                className="aum-cancel"
                onClick={() => { setRollError(null); setRollDraft(toRollDraft(roll)); }}
              >
                ⚙ Configurar ruleta
              </button>
              <button
                type="button"
                className="aum-btn"
                disabled={augments.length === 0}
                title="Prueba la ruleta: no gasta oro ni guarda nada"
                onClick={simulateRoll}
              >
                Simular tirada
              </button>
            </>
          ) : (
            <>
              <span className="aum-soon__badge">Próximamente</span>
              <button type="button" className="aum-btn" disabled title="Próximamente">
                Tirar ruleta
              </button>
            </>
          )}
        </div>
        {rollResult && isAdmin && (
          <div className="aum-roll__result">
            <p className="aum-roll__result-title">
              Ha tocado <span className={`aum-rarity aum-rarity--${rollResult.rarity}`}>{rarityLabel(rollResult.rarity)}</span>
              <span className="aum-roll__sim">Simulación</span>
            </p>
            {rollResult.options.length === 0 ? (
              <p className="aum-status">No hay aumentos de {rarityLabel(rollResult.rarity)} en el catálogo.</p>
            ) : (
              <div className="aum-grid">
                {rollResult.options.map(option => (
                  <article key={option.id} className={`aum-card aum-card--${option.rarity}`}>
                    <h3 className="aum-card__name">
                      {option.name}
                      {option.levels && <AugmentLevelBadge />}
                    </h3>
                    {(option.description || !option.levels) && (
                      <p className={`aum-card__desc${option.description ? '' : ' aum-card__desc--empty'}`}>
                        {option.description || 'Sin descripción'}
                      </p>
                    )}
                    {option.levels && <AugmentLevelList levels={option.levels} />}
                  </article>
                ))}
              </div>
            )}
            {rollResult.options.length > 0 && rollResult.options.length < 3 && (
              <p className="aum-status">Solo hay {rollResult.options.length} de esa rareza; añade más para que salgan 3.</p>
            )}
            <div className="aum-roll__actions">
              <button type="button" className="aum-cancel" onClick={() => setRollResult(null)}>Cerrar</button>
            </div>
          </div>
        )}
      </section>

      {loading && <p className="aum-status">Cargando los aumentos…</p>}
      {loadError && <p className="aum-status aum-error">{loadError}</p>}

      {!loading && !loadError && augments.length === 0 && (
        <div className="aum-empty">
          <span className="aum-empty__icon">✨</span>
          <p>{isAdmin ? 'Todavía no hay aumentos. Añade el primero.' : 'Todavía no hay aumentos'}</p>
        </div>
      )}

      <div className="aum-grid">
        {augments.map(augment => {
          const error = rowError?.id === augment.id ? rowError.text : null;
          const busy = busyId === augment.id;
          return (
            <article key={augment.id} className={`aum-card aum-card--${augment.rarity}`}>
              <span className={`aum-rarity aum-rarity--${augment.rarity}`}>{rarityLabel(augment.rarity)}</span>
              <div className="aum-card__top">
                <h3 className="aum-card__name">{augment.name}</h3>
                {augment.levels && <AugmentLevelBadge />}
              </div>
              {(augment.description || !augment.levels) && (
                <p className={`aum-card__desc${augment.description ? '' : ' aum-card__desc--empty'}`}>
                  {augment.description || 'Sin descripción'}
                </p>
              )}
              {augment.levels && <AugmentLevelList levels={augment.levels} />}
              {error && <p className="aum-error">{error}</p>}
              <div className="aum-card__actions">
                {isAdmin ? (
                  <>
                    <button type="button" className="aum-cancel" disabled={busy} onClick={() => openEdit(augment)}>
                      ✎ Editar
                    </button>
                    <button
                      type="button"
                      className="aum-btn aum-btn--danger"
                      disabled={busy}
                      onClick={() => setPendingDelete(augment)}
                    >
                      {busy ? 'Quitando' : '✕ Quitar'}
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {editing && isAdmin && (
        <Modal onClose={() => { if (!saving) setEditing(null); }} backdropClassName="aum-modal-backdrop" className="aum-modal">
          <form className="aum-form" onSubmit={event => { void submit(event); }}>
            <h2 className="aum-form__title">{editing.id ? 'Editar aumento' : 'Nuevo aumento'}</h2>
            <label className="aum-field">
              <span className="aum-field__label">Nombre</span>
              <input
                className="aum-input"
                type="text"
                value={editing.draft.name}
                maxLength={AUGMENT_NAME_MAX}
                required
                autoFocus
                placeholder="Nombre del aumento"
                onChange={event => setDraft({ name: event.target.value })}
              />
            </label>
            <label className="aum-field">
              <span className="aum-field__label">Rareza</span>
              <select
                className="aum-input"
                value={editing.draft.rarity}
                onChange={event => setDraft({ rarity: event.target.value as AugmentRarity })}
              >
                {AUGMENT_RARITIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label
              className={`aum-toggle${editing.draft.leveled ? ' aum-toggle--on' : ''}`}
              title="El aumento tiene sus propios niveles 1, 2 y 3 (aparte del nivel del player)"
            >
              <input
                type="checkbox"
                checked={editing.draft.leveled}
                onChange={event => setDraft({ leveled: event.target.checked })}
              />
              <span className="aum-toggle__track" aria-hidden="true"><span className="aum-toggle__thumb" /></span>
              <span className="aum-toggle__label">
                {editing.draft.leveled ? 'Con niveles (1, 2 y 3)' : 'Sin niveles: un solo efecto'}
              </span>
            </label>
            <label className="aum-field">
              <span className="aum-field__label">{editing.draft.leveled ? 'Descripción general (opcional)' : 'Descripción'}</span>
              <textarea
                className="aum-input aum-input--text"
                value={editing.draft.description}
                maxLength={AUGMENT_DESCRIPTION_MAX}
                rows={editing.draft.leveled ? 2 : 5}
                placeholder={editing.draft.leveled ? 'Idea común a todos los niveles' : 'Qué hace el aumento'}
                onChange={event => setDraft({ description: event.target.value })}
              />
            </label>
            {editing.draft.leveled && (
              <>
                <p className="aum-modal__text">
                  Nivel del aumento, no del player: empieza en nivel 1 y el admin lo sube a 2 y 3 desde la ficha.
                </p>
                {editing.draft.levels.map((effect, index) => (
                  <label key={index} className="aum-field">
                    <span className="aum-field__label">Efecto nivel {index + 1}</span>
                    <textarea
                      className="aum-input aum-input--text aum-input--level"
                      value={effect}
                      maxLength={AUGMENT_LEVEL_EFFECT_MAX}
                      rows={2}
                      required
                      placeholder={`Qué hace a nivel ${index + 1}`}
                      onChange={event => setLevelEffect(index, event.target.value)}
                    />
                  </label>
                ))}
              </>
            )}
            {formError && <p className="aum-error">{formError}</p>}
            <div className="aum-form__actions">
              <button type="button" className="aum-cancel" disabled={saving} onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button type="submit" className="aum-btn" disabled={saving || !editing.draft.name.trim() || levelsMissing}>
                {saving ? 'Guardando' : editing.id ? 'Guardar' : 'Añadir'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {rollDraft && isAdmin && (
        <Modal onClose={() => { if (!rollSaving) setRollDraft(null); }} backdropClassName="aum-modal-backdrop" className="aum-modal">
          <form className="aum-form" onSubmit={event => { void saveRoll(event); }}>
            <h2 className="aum-form__title">Configurar ruleta</h2>
            <p className="aum-modal__text">Probabilidad (%) de que salga cada rareza. Tienen que sumar 100.</p>
            {AUGMENT_RARITIES.map(r => (
              <label key={r.value} className="aum-field">
                <span className="aum-field__label">{r.label} (%)</span>
                <input
                  className="aum-input"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={rollDraft[r.value]}
                  onChange={event => setRollDraft(current => (current ? { ...current, [r.value]: event.target.value } : current))}
                />
              </label>
            ))}
            <p className={`aum-roll__total${rollTotal === 100 ? '' : ' aum-roll__total--bad'}`}>Total: {rollTotal}%</p>
            <label className="aum-field">
              <span className="aum-field__label">Coste por tirada (oro)</span>
              <input
                className="aum-input"
                type="number"
                min={0}
                step={1}
                value={rollDraft.cost}
                onChange={event => setRollDraft(current => (current ? { ...current, cost: event.target.value } : current))}
              />
            </label>
            {rollError && <p className="aum-error">{rollError}</p>}
            <div className="aum-form__actions">
              <button type="button" className="aum-cancel" disabled={rollSaving} onClick={() => setRollDraft(null)}>
                Cancelar
              </button>
              <button type="submit" className="aum-btn" disabled={rollSaving || rollTotal !== 100}>
                {rollSaving ? 'Guardando' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDelete && isAdmin && (
        <Modal onClose={() => { if (!busyId) setPendingDelete(null); }} backdropClassName="aum-modal-backdrop" className="aum-modal">
          <h2 className="aum-form__title">Quitar aumento</h2>
          <p className="aum-modal__text">«{pendingDelete.name}» desaparece del catálogo para todos. No se puede deshacer.</p>
          <div className="aum-form__actions">
            <button type="button" className="aum-cancel" disabled={busyId === pendingDelete.id} onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
            <button type="button" className="aum-btn aum-btn--danger" disabled={busyId === pendingDelete.id} onClick={() => { void remove(); }}>
              {busyId === pendingDelete.id ? 'Quitando' : 'Quitar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Aumentos;
