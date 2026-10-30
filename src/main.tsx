import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { loadCatalogs } from './data/load';
import { syncAllPlayerStats } from './features/calculos/playerTotals';
import './index.css';

const rootEl = document.getElementById('root')!;
const bootStatus = document.getElementById('boot-status');
const bootRoot = document.getElementById('boot');

const setBootStatus = (text: string, error = false) => {
  if (bootStatus) bootStatus.textContent = text;
  if (error && bootRoot) bootRoot.classList.add('boot--error');
};

loadCatalogs()
  .then(async () => {
    setBootStatus('Sincronizando fichas\u2026');
    try {
      await syncAllPlayerStats();
    } catch {
      // Si falla el guardado, la app sigue; stats se actualizaran al tocar equipo o nivel.
    }
    setBootStatus('Abriendo mesa\u2026');
    document.documentElement.classList.remove('boot-active');
    createRoot(rootEl).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    setBootStatus(
      error instanceof Error ? error.message : 'No se pudieron cargar los datos',
      true,
    );
  });