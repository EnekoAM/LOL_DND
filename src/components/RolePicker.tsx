import './RolePicker.css';
import type { AppRole } from '../data/appRole';

type Props = {
  onPick: (role: AppRole) => void;
};

export default function RolePicker({ onPick }: Props) {
  return (
    <div className="role-picker" role="dialog" aria-modal="true" aria-labelledby="role-picker-title">
      <div className="role-picker__card">
        <span className="role-picker__mark" aria-hidden="true">{'\u269C'}</span>
        <h1 id="role-picker-title" className="role-picker__title">
          ¿Cómo entras?
        </h1>
        <p className="role-picker__hint">
          Se guarda en este navegador. Puedes cambiarlo luego desde el menú.
        </p>
        <div className="role-picker__actions">
          <button type="button" className="role-picker__btn role-picker__btn--admin" onClick={() => onPick('admin')}>
            <span className="role-picker__btn-icon" aria-hidden="true">⚔</span>
            <span className="role-picker__btn-label">Admin</span>
            <span className="role-picker__btn-desc">Gestión completa de la mesa</span>
          </button>
          <button type="button" className="role-picker__btn role-picker__btn--user" onClick={() => onPick('user')}>
            <span className="role-picker__btn-icon" aria-hidden="true">👤</span>
            <span className="role-picker__btn-label">User</span>
            <span className="role-picker__btn-desc">Ve todo; solo edita fichas</span>
          </button>
        </div>
      </div>
    </div>
  );
}
