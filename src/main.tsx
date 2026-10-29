import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { loadCatalogs } from './data/load';
import { syncAllPlayerStats } from './features/calculos/playerTotals';
import './index.css';

const rootEl = document.getElementById('root')!;
rootEl.style.padding = '2rem';
rootEl.textContent = 'Cargando...';

loadCatalogs()
  .then(async () => {
    try {
      await syncAllPlayerStats();
    } catch {
      // Si falla el guardado, la app sigue; stats se actualizarán al tocar equipo o nivel.
    }
    rootEl.style.padding = '';
    rootEl.textContent = '';
    createRoot(rootEl).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    rootEl.textContent = error instanceof Error ? error.message : 'No se pudieron cargar los datos';
  });
