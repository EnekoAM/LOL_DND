import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './BackgroundViewer.css';

type Props = {
  /** URL del fondo de la ficha. */
  src: string;
  /** Nombre de la ficha (texto alternativo y título). */
  name: string;
};

/**
 * Botón «Ver fondo» de las fichas (campeón y NPC): abre el fondo a pantalla completa,
 * nítido y sin el oscurecido de la ficha. Se cierra con Esc, clic fuera o «Cerrar».
 */
const BackgroundViewer = ({ src, name }: Props) => {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setOpen(false);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="calc-back-btn bg-viewer__open"
        title="Ver el fondo de la ficha a pantalla completa"
        onClick={() => setOpen(true)}
      >
        🖼 Ver fondo
      </button>
      {open && createPortal(
        <div
          className="bg-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={`Fondo de ${name}`}
          onClick={() => setOpen(false)}
        >
          <div className="bg-viewer__bar" onClick={e => e.stopPropagation()}>
            <span className="bg-viewer__title">Fondo · {name}</span>
            <a className="bg-viewer__btn" href={src} target="_blank" rel="noreferrer">Abrir original ↗</a>
            <button type="button" className="bg-viewer__btn" onClick={() => setOpen(false)} autoFocus>✕ Cerrar</button>
          </div>
          {failed ? (
            <p className="bg-viewer__error">No se pudo cargar la imagen de fondo.</p>
          ) : (
            <img
              className="bg-viewer__img"
              src={src}
              alt={`Fondo de ${name}`}
              onClick={e => e.stopPropagation()}
              onError={() => setFailed(true)}
            />
          )}
        </div>,
        document.body,
      )}
    </>
  );
};

export default BackgroundViewer;
