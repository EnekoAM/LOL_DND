import { useEffect, type ReactNode } from 'react';

type Props = {
  onClose: () => void;
  backdropClassName: string;
  className: string;
  children: ReactNode;
};

const Modal = ({ onClose, backdropClassName, className, children }: Props) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className={backdropClassName} onClick={onClose}>
      <div className={className} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};

export default Modal;
