import { useEffect, useState } from 'react';
import type { Ability } from '../../data/champions';
import { useCanEdit } from '../../data/appRoleContext';
import {
  NPC_ABILITIES_MAX,
  NPC_STATS,
  npcKindIcon,
  npcKindLabel,
  npcImageStyle,
  updateNpc,
  updateNpcAsPlayer,
  type Npc,
  type NpcAbility,
  type NpcInput,
  type NpcPatch,
} from '../../data/npcs';
import { cx } from '../../lib/cx';
import AbilityCard from '../calculos/AbilityCard';
import RelationsPanel from '../relaciones/RelationsPanel';
import PrivateNotesPanel from '../notas/PrivateNotesPanel';
import BackgroundViewer from '../../components/BackgroundViewer';
import NpcAbilityModal from './NpcAbilityModal';
import NpcEditorModal from './NpcEditorModal';
import NpcPlayerEditModal from './NpcPlayerEditModal';

type Props = {
  npc: Npc;
  types: string[];
  regions: string[];
  onBack: () => void;
  onChange: (npc: Npc) => void;
  onDelete: (npc: Npc) => Promise<void>;
  onSelectAbility: (ability: Ability) => void;
};

type SheetTab = 'habilidades' | 'descripcion' | 'relaciones' | 'notas';
const TABS: { id: SheetTab; label: string }[] = [
  { id: 'habilidades', label: 'Habilidades' },
  { id: 'descripcion', label: 'Descripción' },
  { id: 'relaciones', label: 'Relaciones' },
];
/** Players: sin Habilidades y con sus notas privadas (la descripción sigue siendo compartida). */
const PLAYER_TABS: { id: SheetTab; label: string }[] = [...TABS.filter(entry => entry.id !== 'habilidades'), { id: 'notas', label: 'Notas privadas' }];

/** Abierto: habilidad existente (id), nueva ('new') o ninguna. */
type AbilityOpen = { id: string | 'new'; edit: boolean } | null;

const formatStat = (value: number) => (Number.isInteger(value) ? String(value) : value.toLocaleString('es-ES', { maximumFractionDigits: 2 }));

const toInput = ({ id: _id, createdAt: _c, updatedAt: _u, ...rest }: Npc): NpcInput => rest;

const NpcSheet = ({ npc, types, regions, onBack, onChange, onDelete, onSelectAbility }: Props) => {
  const canEdit = useCanEdit();
  const [tab, setTab] = useState<SheetTab>(canEdit ? 'habilidades' : 'descripcion');
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [playerEditing, setPlayerEditing] = useState(false);
  const [abilityOpen, setAbilityOpen] = useState<AbilityOpen>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPortraitFailed(false);
  }, [npc.image]);

  useEffect(() => {
    setEditing(false);
    setPlayerEditing(false);
    setAbilityOpen(null);
    setConfirmDelete(false);
    setError(null);
  }, [npc.id]);

  // Players: sin pestaña de habilidades (ni modales abiertos si el admin cambia de rol en vivo).
  useEffect(() => {
    if (canEdit) {
      setTab(current => (current === 'notas' ? 'habilidades' : current));
      return;
    }
    setTab(current => (current === 'habilidades' ? 'descripcion' : current));
    setAbilityOpen(null);
    setEditing(false);
  }, [canEdit]);

  const background = npc.background?.trim() || '';
  // Players no ven stats (la API ya no se las manda): vida, resistencias… van en la descripción.
  const stats = canEdit ? NPC_STATS.filter(({ key }) => typeof npc.stats[key] === 'number') : [];
  const meta = [npc.type, npc.region].filter(Boolean);
  const tabs = canEdit ? TABS : PLAYER_TABS;

  const persist = async (patch: NpcPatch) => {
    setSaving(true);
    setError(null);
    try {
      onChange(await updateNpc(npc.id, patch));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
      throw caught;
    } finally {
      setSaving(false);
    }
  };

  const saveAbility = async (ability: NpcAbility) => {
    const exists = npc.abilities.some(a => a.id === ability.id);
    const abilities = exists ? npc.abilities.map(a => (a.id === ability.id ? ability : a)) : [...npc.abilities, ability];
    await persist({ abilities });
  };

  const removeAbility = async (id: string) => {
    await persist({ abilities: npc.abilities.filter(a => a.id !== id) });
  };

  const moveAbility = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= npc.abilities.length || saving) return;
    const abilities = [...npc.abilities];
    [abilities[index], abilities[target]] = [abilities[target], abilities[index]];
    void persist({ abilities }).catch(() => undefined);
  };

  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      await onDelete(npc);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo borrar');
      setSaving(false);
    }
  };

  const openAbility = abilityOpen
    ? abilityOpen.id === 'new' ? null : npc.abilities.find(a => a.id === abilityOpen.id) ?? undefined
    : undefined;

  return (
    <div
      className={cx('sheet', 'champ-sheet', 'npc-sheet', background && 'champ-sheet--bg')}
      style={background ? { ['--champ-sheet-bg' as string]: `url("${background.replace(/"/g, '\\"')}")` } : undefined}
    >
      <div className="sheet-topbar">
        <button type="button" className="calc-back-btn sheet-back" onClick={onBack}>
          ← Todos los NPCs
        </button>
        {background && <BackgroundViewer src={background} name={npc.name} />}
      </div>

      <div className="sheet-body">
        <aside className="sheet-side">
          <div className="sheet-portrait champ-sheet__portrait">
            {npc.image && !portraitFailed ? (
              <img className="sheet-portrait__img" src={npc.image} alt={npc.name} style={npcImageStyle(npc.imageFrame)} onError={() => setPortraitFailed(true)} />
            ) : (
              <div className="sheet-portrait__placeholder" aria-hidden="true">{npc.name.charAt(0) || '?'}</div>
            )}
          </div>

          <div className="sheet-side__identity">
            <h1 className="sheet-side__name">{npc.name}</h1>
            {canEdit && (
              <div className="sheet-side__meta">
                <span className="champ-sheet__level">NVL {npc.level}</span>
                {' \u00B7 '}{npcKindIcon(npc.kind)} {npcKindLabel(npc.kind)}
                {meta.map(text => <span key={text}>{' \u00B7 '}{text}</span>)}
              </div>
            )}
            {canEdit && npc.visible && <div className="champ-sheet__active-badge">Visible</div>}
          </div>

          {stats.length > 0 && (
            <div className="sheet-panel champ-sheet__stats" aria-label="Estadísticas">
              <div className="sheet-defense champ-sheet__defense npc-sheet__stats">
                {stats.map(({ key, label, title }) => (
                  <div key={key} className="sheet-defense__card" title={title}>
                    <div className="sheet-defense__label">{label}</div>
                    <div className="sheet-defense__value">{formatStat(npc.stats[key] as number)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canEdit && (
            <div className="champ-sheet__toggles npc-sheet__admin">
              <button
                type="button"
                className={cx('champ-sheet__toggle', npc.visible && 'champ-sheet__toggle--on')}
                aria-pressed={npc.visible}
                disabled={saving}
                title={npc.visible ? 'Ocultar a los players' : 'Mostrar a los players'}
                onClick={() => { void persist({ visible: !npc.visible }).catch(() => undefined); }}
              >
                {npc.visible ? 'Visible para players' : 'Oculto'}
              </button>
              <button type="button" className="champ-sheet__toggle" disabled={saving} onClick={() => setEditing(true)}>
                ✎ Editar datos
              </button>
              {confirmDelete ? (
                <span className="npc-sheet__confirm">
                  <button type="button" className="champ-sheet__toggle npc-btn--danger" disabled={saving} onClick={() => { void remove(); }}>
                    {saving ? 'Borrando…' : 'Sí, borrar'}
                  </button>
                  <button type="button" className="champ-sheet__toggle" disabled={saving} onClick={() => setConfirmDelete(false)}>
                    No
                  </button>
                </span>
              ) : (
                <button type="button" className="champ-sheet__toggle" disabled={saving} onClick={() => setConfirmDelete(true)}>
                  🗑 Borrar NPC
                </button>
              )}
            </div>
          )}

          {!canEdit && (
            <div className="champ-sheet__toggles npc-sheet__admin">
              <button type="button" className="champ-sheet__toggle" disabled={saving} onClick={() => setPlayerEditing(true)}>
                ✎ Editar descripción y notas públicas
              </button>
            </div>
          )}

          {error && <p className="sheet-hp__error" role="alert">{error}</p>}
        </aside>

        <div className="sheet-content">
          <div className="sheet-tabs" role="tablist" aria-label="Secciones de la ficha">
            {tabs.map(entry => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={cx('sheet-tab', tab === entry.id && 'sheet-tab--active')}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
                {entry.id === 'habilidades' && npc.abilities.length > 0 && ` (${npc.abilities.length})`}
              </button>
            ))}
          </div>

          {tab === 'habilidades' && canEdit && (
            <>
              {npc.abilities.length === 0 && !canEdit && (
                <p className="calc-build-empty">Este NPC no tiene habilidades.</p>
              )}
              <div className="calc-grid">
                {npc.abilities.map((ability, index) => (
                  <AbilityCard
                    key={ability.id}
                    label={ability.label || String(index + 1)}
                    name={ability.name}
                    ability={ability}
                    onSelect={onSelectAbility}
                  >
                    {ability.description && <p className="npc-ability__preview">{ability.description}</p>}
                    <div className="calc-ability-actions">
                      <button type="button" className="calc-ability-edit" onClick={() => setAbilityOpen({ id: ability.id, edit: false })}>
                        Ver
                      </button>
                      {canEdit && (
                        <>
                          <button type="button" className="calc-ability-edit" onClick={() => setAbilityOpen({ id: ability.id, edit: true })}>
                            Editar
                          </button>
                          <button type="button" className="calc-ability-edit" title="Mover antes" disabled={saving || index === 0} onClick={() => moveAbility(index, -1)}>↑</button>
                          <button type="button" className="calc-ability-edit" title="Mover después" disabled={saving || index === npc.abilities.length - 1} onClick={() => moveAbility(index, 1)}>↓</button>
                        </>
                      )}
                    </div>
                  </AbilityCard>
                ))}
                {canEdit && npc.abilities.length < NPC_ABILITIES_MAX && (
                  <button
                    type="button"
                    className="calc-card calc-card--ability npc-ability-add"
                    disabled={saving}
                    onClick={() => setAbilityOpen({ id: 'new', edit: true })}
                  >
                    <span className="npc-ability-add__plus" aria-hidden="true">+</span>
                    <span>Añadir habilidad</span>
                  </button>
                )}
              </div>
            </>
          )}

          {tab === 'relaciones' && (
            <RelationsPanel self={{ kind: 'npc', id: npc.id }} selfName={npc.name} />
          )}

          {tab === 'notas' && !canEdit && (
            <PrivateNotesPanel kind="npc" id={npc.id} name={npc.name} />
          )}

          {tab === 'descripcion' && (
            <section className="sheet-panel">
              <div className="sheet-panel__title">Descripción</div>
              <p className="npc-sheet__description">{npc.description || 'Sin descripción.'}</p>
              <div className="sheet-panel__title" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>Notas públicas</span>
                {!canEdit && (
                  <button
                    type="button"
                    className="sheet-hp__icon-btn"
                    disabled={saving}
                    aria-label="Editar notas públicas"
                    title="Editar notas públicas"
                    onClick={() => setPlayerEditing(true)}
                  >
                    ✎
                  </button>
                )}
              </div>
              <p className={npc.publicNotes?.trim() ? 'npc-public-notes' : 'npc-public-notes npc-public-notes__empty'}>
                {npc.publicNotes?.trim() || 'Sin notas públicas.'}
              </p>
            </section>
          )}
        </div>
      </div>

      {canEdit && abilityOpen && openAbility !== undefined && (
        <NpcAbilityModal
          key={abilityOpen.id}
          npc={npc}
          ability={openAbility}
          canEdit={canEdit}
          startEditing={abilityOpen.edit}
          onClose={() => setAbilityOpen(null)}
          onSave={saveAbility}
          onDelete={removeAbility}
        />
      )}

      {playerEditing && !canEdit && (
        <NpcPlayerEditModal
          npc={npc}
          onClose={() => setPlayerEditing(false)}
          onSubmit={async patch => {
            onChange(await updateNpcAsPlayer(npc.id, patch));
            setPlayerEditing(false);
          }}
        />
      )}

      {editing && canEdit && (
        <NpcEditorModal
          title={`Editar ${npc.name}`}
          initial={toInput(npc)}
          types={types}
          regions={regions}
          submitLabel="Guardar"
          onClose={() => setEditing(false)}
          onSubmit={async input => {
            // Las habilidades se gestionan aparte: no se pisan desde el formulario.
            const { abilities: _abilities, ...patch } = input;
            await persist(patch);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
};

export default NpcSheet;
