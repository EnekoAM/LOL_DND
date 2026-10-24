import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadCatalogs } from './data/load';
import './index.css';

const rootEl = document.getElementById('root')!;
rootEl.style.padding = '2rem';
rootEl.textContent = 'Cargando...';

loadCatalogs()
  .then(() => {
    rootEl.style.padding = '';
    rootEl.textContent = '';
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    rootEl.textContent = error instanceof Error ? error.message : 'No se pudieron cargar los datos';
  });
