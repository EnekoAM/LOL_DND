import { useState, useMemo } from 'react';
import championsData from '../json/habilidades.json';
import './Habilidades.css';

const KEYS = ['P', 'Q', 'W', 'E', 'R'] as const;

const keyLabel: Record<string, string> = {
  P: 'Pasiva', Q: 'Q', W: 'W', E: 'E', R: 'Ultimate',
};

const REGION_COLORS: Record<string, string> = {
  'Demacia':      '#2a4a8a',
  'Noxus':        '#8a1a1a',
  'Freljord':     '#2a7aaa',
  'Ionia':        '#9a3a6a',
  'Shurima':      '#c97a1a',
  'Zaun':         '#2a8a5a',
  'Piltover':     '#c9a84c',
  'Void':         '#7a2a9a',
  'Shadow Isles': '#2a6a4a',
  'Bilgewater':   '#1a6a8a',
  'Bandle City':  '#8a6a1a',
  'Ixtal':        '#3a7a2a',
  'Mount Targon': '#6a5a8a',
  'Runeterra':    '#6a5a3a',
};

const ROLE_COLORS: Record<string, string> = {
  'Luchador': '#c97a1a',
  'Mago':     '#7a2a9a',
  'Tirador':  '#2a7aaa',
  'Tanque':   '#4a6a2a',
  'Asesino':  '#8a1a1a',
  'Soporte':  '#c9a84c',
};

const ROLE_ICONS: Record<string, string> = {
  'Luchador': '⚔',
  'Mago':     '✦',
  'Tirador':  '◎',
  'Tanque':   '🛡',
  'Asesino':  '☽',
  'Soporte':  '❂',
};

const ALL_REGIONS = Array.from(
  new Set(championsData.map(c => (c as any).region).filter(Boolean))
).sort() as string[];

const ALL_ROLES = ['Luchador', 'Mago', 'Tirador', 'Tanque', 'Asesino', 'Soporte'];

const Habilidades = () => {
  const [search, setSearch]     = useState('');
  const [region, setRegion]     = useState<string | null>(null);
  const [role, setRole]         = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() =>
    championsData.filter(c => {
      const matchSearch = c.champion.toLowerCase().includes(search.toLowerCase());
      const matchRegion = !region || (c as any).region === region;
      const matchRole   = !role   || (c as any).role   === role;
      return matchSearch && matchRegion && matchRole;
    }),
    [search, region, role]
  );

  return (
    <div className="hab-root">

      {/* ── SEARCH + FILTERS ── */}
      <div className="hab-search-wrap">
        <span className="hab-search__icon">⚔</span>
        <input
          className="hab-search"
          type="text"
          placeholder="Buscar campeón..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="hab-select"
          value={region ?? ''}
          onChange={e => setRegion(e.target.value || null)}
        >
          <option value="">Región</option>
          {ALL_REGIONS.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          className="hab-select"
          value={role ?? ''}
          onChange={e => setRole(e.target.value || null)}
        >
          <option value="">Rol</option>
          {ALL_ROLES.map(r => (
            <option key={r} value={r}>{ROLE_ICONS[r]} {r}</option>
          ))}
        </select>
        <span className="hab-search__count">{filtered.length}</span>
      </div>

      {/* ── LIST ── */}
      <div className="hab-list">
        {filtered.map(champion => {
          const isOpen      = expanded === champion.champion;
          const champRegion = (champion as any).region as string;
          const champRole   = (champion as any).role   as string;
          const regionColor = REGION_COLORS[champRegion] ?? '#c9a84c';
          return (
            <div
              key={champion.champion}
              className={`hab-champion ${isOpen ? 'hab-champion--open' : ''}`}
              style={{ '--champ-color': regionColor } as React.CSSProperties}
            >
              <button
                className="hab-champion__header"
                onClick={() => setExpanded(isOpen ? null : champion.champion)}
              >
                <span className="hab-champion__ornament">✦</span>
                {(champion as any).image ? (
                  <img
                    className="hab-champion__avatar"
                    src={(champion as any).image}
                    alt={champion.champion}
                  />
                ) : (
                  <span className="hab-champion__avatar hab-champion__avatar--empty">
                    {champion.champion.charAt(0)}
                  </span>
                )}
                <span className="hab-champion__name">{champion.champion}</span>
                <span className="hab-champion__region">{champRegion}</span>
                <span
                  className="hab-champion__role"
                  style={{ '--role-color': ROLE_COLORS[champRole] ?? '#c9a84c' } as React.CSSProperties}
                >
                  {ROLE_ICONS[champRole]} {champRole}
                </span>
                <span className="hab-champion__keys">
                  {KEYS.map(k => (
                    <span key={k} className={`hab-key-pip ${champion.abilities[k] ? 'hab-key-pip--active' : ''}`}>{k}</span>
                  ))}
                </span>
                <span className="hab-champion__arrow">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="hab-abilities">
                  {KEYS.map(k => {
                    const ability = champion.abilities[k as keyof typeof champion.abilities];
                    return (
                      <div key={k} className={`hab-ability ${ability ? 'hab-ability--filled' : 'hab-ability--empty'}`}>
                        <div className="hab-ability__key">{k}</div>
                        <div className="hab-ability__label">{keyLabel[k]}</div>
                        {ability ? (
                          <>
                            <div className="hab-ability__name">{(ability as any).name}</div>
                            <div className="hab-ability__desc">{(ability as any).description}</div>
                          </>
                        ) : (
                          <div className="hab-ability__none">— No disponible —</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="hab-empty">
            <span className="hab-empty__icon">✦</span>
            <p>Ningún campeón encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Habilidades;