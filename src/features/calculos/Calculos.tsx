import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppRole } from '../../data/appRoleContext';
import { CHAMPIONS, type Ability, type Champion } from '../../data/champions';
import { OPEN_RELATED_EVENT, peekPendingOpen, takePendingOpen, type RelationRef } from '../../data/relations';
import { normalizeName } from '../../lib/text';
import { useStoredSet } from '../../hooks/useStoredSet';
import ChampionSheet from './ChampionSheet';
import { CHAMPIONS_PATH, championSlugPath, championUrl, findChampionBySlug, normalizeSplat } from './championRoute';
import ChampionPicker, { type ChampionPickerFilter } from './ChampionPicker';
import { DEFAULT_DAMAGE_INPUTS, type DamageInputs } from './damage';
import DamagePanel from './DamagePanel';
import './Calculos.css';

const FAVORITES_STORAGE_KEY = 'calc-champ-favorites';

const findChampion = (name: string | null): Champion | null =>
  name ? CHAMPIONS.find(c => normalizeName(c.champion) === normalizeName(name)) ?? null : null;

const baseFilter = (onlyActive: boolean): ChampionPickerFilter => ({
  search: '',
  region: '',
  role: '',
  onlyFavorites: false,
  onlyLearned: false,
  onlyActive,
});

/**
 * Campeones: grid unificado (foto, rol, región, aprendidas) + detalle con daño y edición de habilidades.
 */
const Calculos = () => {
  const { canEdit } = useAppRole();
  const navigate = useNavigate();
  // Lo que va tras /champions/ (vacío = lista). La URL manda: /champions/<región>/<rol>/<nombre>.
  const splat = normalizeSplat(useParams()['*'] ?? '');
  const [selectedChampion, setChampion] = useState<Champion | null>(null);
  // Si se llegó desde «Relaciones» de otra ficha, se abre directamente ese campeón.
  const [pendingName, setPendingName] = useState<string | null>(() => peekPendingOpen('champion'));
  // Se consume ya montada la pantalla (no en el inicializador, que StrictMode ejecuta dos veces).
  useEffect(() => {
    const id = takePendingOpen('champion');
    if (id) setPendingName(id);
  }, []);
  // Players nunca pueden abrir un campeón inactivo (p. ej. si el admin lo desactiva en vivo).
  const canOpen = (entry: Champion) => canEdit || entry.active === true;
  const champion = splat && selectedChampion && canOpen(selectedChampion) ? selectedChampion : null;
  const [pickerFilter, setPickerFilter] = useState(() => baseFilter(!canEdit));
  // Página del grid (50 por página). Se conserva al abrir/cerrar una ficha; vuelve a 1 al cambiar filtros.
  const [pickerPage, setPickerPage] = useState(1);
  const [favorites, toggleFavorite] = useStoredSet(FAVORITES_STORAGE_KEY);
  const [ability, setAbility] = useState<Ability | null>(null);
  const [damageInputs, setDamageInputs] = useState(DEFAULT_DAMAGE_INPUTS);

  // Relaciones dentro de la misma pantalla: abrir otro campeón.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const ref = (event as CustomEvent<RelationRef>).detail;
      if (ref?.kind !== 'champion') return;
      const name = takePendingOpen('champion');
      if (name) setPendingName(name);
    };
    window.addEventListener(OPEN_RELATED_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_RELATED_EVENT, onOpen);
  }, []);

  // URL → ficha abierta (enlace directo, atrás/adelante del navegador, cambios de región o rol).
  useEffect(() => {
    if (!splat) {
      setChampion(null);
      setAbility(null);
      return;
    }
    if (selectedChampion && canOpen(selectedChampion) && championSlugPath(selectedChampion) === splat) return;
    const found = findChampionBySlug(CHAMPIONS, splat);
    if (!found || !canOpen(found)) {
      navigate(CHAMPIONS_PATH, { replace: true });
      return;
    }
    if (!selectedChampion || normalizeName(selectedChampion.champion) !== normalizeName(found.champion)) setAbility(null);
    setChampion(found);
    // Ruta canónica (p. ej. si cambió la región/rol o el enlace venía en otro formato).
    if (championSlugPath(found) !== splat) navigate(championUrl(found), { replace: true });
  }, [splat, selectedChampion, canEdit, navigate]);

  // Campeón pendiente desde «Relaciones»: se navega a su URL.
  useEffect(() => {
    if (!pendingName) return;
    setPendingName(null);
    const target = findChampion(pendingName);
    if (target && canOpen(target)) {
      setAbility(null);
      setChampion(target);
      navigate(championUrl(target), { replace: true });
    }
  }, [pendingName, navigate]);

  const openChampion = (target: Champion) => {
    setAbility(null);
    setChampion(target);
    navigate(championUrl(target));
  };

  const updatePickerFilter = (patch: Partial<ChampionPickerFilter>) => {
    setPickerFilter(prev => ({ ...prev, ...patch }));
    setPickerPage(1);
  };
  const updateDamageInputs = (patch: Partial<DamageInputs>) =>
    setDamageInputs(prev => ({ ...prev, ...patch }));

  return (
    <div className={champion && !ability ? 'calc-root calc-root--sheet' : 'calc-root'}>
      {ability ? (
        <DamagePanel
          ability={ability}
          inputs={damageInputs}
          onInputsChange={updateDamageInputs}
          onBack={() => setAbility(null)}
        />
      ) : (
        <>
          <div className="calc-section-title">Campeones</div>
          {champion ? (
            <ChampionSheet
              champion={champion}
              onBack={() => navigate(CHAMPIONS_PATH)}
              onSelectAbility={setAbility}
              onChampionChange={setChampion}
            />
          ) : (
            <ChampionPicker
              filter={pickerFilter}
              onFilterChange={updatePickerFilter}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onSelect={openChampion}
              page={pickerPage}
              onPageChange={setPickerPage}
            />
          )}
        </>
      )}
    </div>
  );
};

export default Calculos;
