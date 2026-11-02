import { useEffect, useState } from 'react';
import { cx } from '../../lib/cx';

/** Máximo que acepta la API para la URL del fondo. */
export const SHEET_BACKGROUND_MAX = 2000;

/** Valor CSS para la variable del fondo (comillas y saltos escapados). */
export function sheetBackgroundCss(url: string): string {
  return `url("${url.replace(/[\\"]/g, '\\$&').replace(/[\r\n]/g, '')}")`;
}

type ButtonProps = {
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

/** Lápiz sobre el retrato que abre el editor del fondo. */
export const SheetBackgroundButton = ({ open, disabled, onToggle }: ButtonProps) => (
  <button
    type="button"
    className={cx('sheet-hp__icon-btn', 'sheet-bg__edit', open && 'sheet-bg__edit--on')}
    aria-label="Editar fondo de la ficha"
    aria-pressed={open}
    title="Editar fondo de la ficha"
    disabled={disabled}
    onClick={onToggle}
  >
    {'\u270E'}
  </button>
);

type EditorProps = {
  playerName: string;
  background: string;
  onSave: (background: string | null) => Promise<void>;
  onClose: () => void;
};

/** Fondo propio de la ficha de este player (no afecta a otros players ni a los campeones). */
export const SheetBackgroundEditor = ({ playerName, background, onSave, onClose }: EditorProps) => {
  const [draft, setDraft] = useState(background);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(background);
  }, [background]);

  const save = async (next: string | null) => {
    if ((next ?? '') === background) return;
    if (next && next.length > SHEET_BACKGROUND_MAX) {
      setError(`La URL puede tener como máximo ${SHEET_BACKGROUND_MAX} caracteres`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar el fondo');
      setDraft(background);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-panel sheet-bg__panel">
      <label className="sheet-bg__field">
        <span className="sheet-bg__label">Fondo de la ficha</span>
        <input
          className="sheet-bg__input"
          type="url"
          placeholder="URL de imagen de fondo"
          value={draft}
          disabled={busy}
          maxLength={SHEET_BACKGROUND_MAX}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { void save(draft.trim() || null); }}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(background);
              onClose();
            }
          }}
        />
      </label>
      <p className="sheet-bg__hint">
        {background
          ? `Solo se ve en la ficha de ${playerName}.`
          : 'Sin fondo propio: se usa el fondo normal de la ficha. Pega la URL de una imagen.'}
      </p>
      {error && <p className="sheet-bg__error" role="alert">{error}</p>}
      <div className="sheet-bg__actions">
        <button
          type="button"
          className="calc-ability-edit"
          disabled={busy || !background}
          onClick={() => {
            setDraft('');
            void save(null);
          }}
        >
          Quitar fondo
        </button>
        <button type="button" className="calc-ability-edit" disabled={busy} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
};
