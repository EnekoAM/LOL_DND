import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { loadCatalogs } from './data/load';
import { installApiWakeIndicator } from './lib/apiWake';
import { syncAllPlayerStats } from './features/calculos/playerTotals';
import { notifyLocalChange, startLiveSync } from './data/live';
import './index.css';

const rootEl = document.getElementById('root')!;
const bootStatus = document.getElementById('boot-status');
const bootRoot = document.getElementById('boot');

const setBootStatus = (text: string, error = false) => {
  if (bootStatus) bootStatus.textContent = text;
  if (error && bootRoot) bootRoot.classList.add('boot--error');
};

// Antes de la primera peticion: aviso si Render tarda en despertar.
installApiWakeIndicator();

loadCatalogs()
  .then(() => {
    // La sync en vivo arranca ya: marca las peticiones con el id de la pestana (X-Client-Id)
    // antes de guardar nada, asi esta pestana no se recarga con sus propios cambios.
    startLiveSync();
    setBootStatus('Abriendo mesa\u2026');
    document.documentElement.classList.remove('boot-active');
    createRoot(rootEl).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
    // Stats de las fichas en segundo plano (no bloquea el primer pintado) y solo si cambian.
    // Si falla el guardado, la app sigue; stats se actualizaran al tocar equipo o nivel.
    void syncAllPlayerStats()
      .then(saved => { if (saved > 0) notifyLocalChange('players'); })
      .catch(() => undefined);
  })
  .catch((error: unknown) => {
    setBootStatus(
      error instanceof Error ? error.message : 'No se pudieron cargar los datos',
      true,
    );
  });