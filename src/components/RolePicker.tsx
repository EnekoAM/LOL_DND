import { useEffect, useRef, useState, type FormEvent } from 'react';
import './RolePicker.css';
import { ADMIN_PIN_LENGTH, checkAdminPin, type AppIdentity, type AppRole } from '../data/appRole';
import { playerPortraitUrl, type Player } from '../data/players';

type Props = {
  /** identity solo para User: player elegido o invitado. */
  onPick: (role: AppRole, identity: AppIdentity | null) => void;
  /** Players entre los que puede elegir un User. */
  players: Player[];
  /** 'player': salta directo a «¿Quién eres?» (User ya elegido, falta el player). */
  startStep?: 'role' | 'player';
};

const PlayerChoice = ({ player, onClick }: { player: Player; onClick: () => void }) => {
  const portrait = playerPortraitUrl(player.image);
  const [failed, setFailed] = useState(false);
  return (
    <button type="button" className="role-picker__btn role-picker__btn--player" onClick={onClick}>
      <span className="role-picker__avatar" aria-hidden="true">
        {portrait && !failed ? <img src={portrait} alt="" onError={() => setFailed(true)} /> : '👤'}
      </span>
      <span className="role-picker__btn-label">{player.name}</span>
      <span className="role-picker__btn-desc">{player.rol?.trim() || 'Sin rol'}</span>
    </button>
  );
};

export default function RolePicker({ onPick, players, startStep = 'role' }: Props) {
  const [choosingPlayer, setChoosingPlayer] = useState(startStep === 'player');
  const [askingPin, setAskingPin] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (askingPin) pinRef.current?.focus();
  }, [askingPin]);

  const startAdmin = () => {
    setPin('');
    setError(null);
    setAskingPin(true);
  };

  const cancelPin = () => {
    setAskingPin(false);
    setPin('');
    setError(null);
  };

  const submitPin = (event: FormEvent) => {
    event.preventDefault();
    if (pin.length !== ADMIN_PIN_LENGTH) {
      setError(`El PIN tiene ${ADMIN_PIN_LENGTH} dígitos.`);
      return;
    }
    if (checkAdminPin(pin)) {
      onPick('admin', null);
      return;
    }
    setError('PIN incorrecto. Prueba otra vez o entra como User.');
    setPin('');
    pinRef.current?.focus();
  };

  return (
    <div className="role-picker" role="dialog" aria-modal="true" aria-labelledby="role-picker-title">
      <div className="role-picker__card">
        <img className="role-picker__mark" src="/logo.png" alt="" width="36" height="41" decoding="async" />
        {choosingPlayer ? (
          <div className="role-picker__who">
            <h1 id="role-picker-title" className="role-picker__title">
              ¿Quién eres?
            </h1>
            <p className="role-picker__hint">
              Elige tu player o entra como invitado. Se guarda en este navegador.
            </p>
            <div className="role-picker__players">
              {players.map(player => (
                <PlayerChoice key={player.name} player={player} onClick={() => onPick('user', { kind: 'player', name: player.name })} />
              ))}
              {players.length === 0 && <p className="role-picker__hint">Todavía no hay players.</p>}
              <button
                type="button"
                className="role-picker__btn role-picker__btn--guest"
                onClick={() => onPick('user', { kind: 'guest' })}
              >
                <span className="role-picker__btn-icon" aria-hidden="true">🕯</span>
                <span className="role-picker__btn-label">Invitado</span>
                <span className="role-picker__btn-desc">Mira la mesa sin ser ningún player</span>
              </button>
            </div>
            <div className="role-picker__pin-actions role-picker__who-actions">
              <button type="button" className="role-picker__pin-btn" onClick={() => setChoosingPlayer(false)}>
                Volver
              </button>
            </div>
          </div>
        ) : askingPin ? (
          <form className="role-picker__pin" onSubmit={submitPin} noValidate>
            <h1 id="role-picker-title" className="role-picker__title">
              PIN de admin
            </h1>
            <p className="role-picker__hint">Introduce el PIN de {ADMIN_PIN_LENGTH} dígitos.</p>
            <input
              ref={pinRef}
              className={error ? 'role-picker__pin-input role-picker__pin-input--error' : 'role-picker__pin-input'}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="\d*"
              maxLength={ADMIN_PIN_LENGTH}
              value={pin}
              aria-label="PIN de admin"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'role-picker-pin-error' : undefined}
              onChange={event => {
                setPin(event.target.value.replace(/\D/g, '').slice(0, ADMIN_PIN_LENGTH));
                setError(null);
              }}
            />
            <p id="role-picker-pin-error" className="role-picker__pin-error" role="alert">
              {error ?? '\u00A0'}
            </p>
            <div className="role-picker__pin-actions">
              <button type="button" className="role-picker__pin-btn" onClick={cancelPin}>
                Volver
              </button>
              <button
                type="submit"
                className="role-picker__pin-btn role-picker__pin-btn--primary"
                disabled={pin.length !== ADMIN_PIN_LENGTH}
              >
                Entrar
              </button>
            </div>
          </form>
        ) : (
          <>
            <h1 id="role-picker-title" className="role-picker__title">
              ¿Cómo entras?
            </h1>
            <p className="role-picker__hint">
              Se guarda en este navegador. Puedes cambiarlo luego desde el menú.
            </p>
            <div className="role-picker__actions">
              <button type="button" className="role-picker__btn role-picker__btn--admin" onClick={startAdmin}>
                <span className="role-picker__btn-icon" aria-hidden="true">⚔</span>
                <span className="role-picker__btn-label">Admin</span>
                <span className="role-picker__btn-desc">Gestión completa de la mesa · requiere PIN</span>
              </button>
              <button type="button" className="role-picker__btn role-picker__btn--user" onClick={() => setChoosingPlayer(true)}>
                <span className="role-picker__btn-icon" aria-hidden="true">👤</span>
                <span className="role-picker__btn-label">User</span>
                <span className="role-picker__btn-desc">Elige tu player o entra como invitado</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}