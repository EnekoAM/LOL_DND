import { memo, useState, type CSSProperties } from 'react';
import { thumbUrl } from '../lib/thumb';

type Props = {
  src: string;
  /** Ancho de la miniatura de la wiki; sin él se usa la imagen original. */
  thumbWidth?: number;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  width?: number;
  height?: number;
};

/**
 * <img> ligero para listas: miniatura de la wiki si aplica, lazy + decoding async, y si la
 * miniatura falla (p. ej. la original es más pequeña que el ancho pedido) vuelve a la original.
 */
const ThumbImg = ({ src, thumbWidth, alt = '', className, style, width, height }: Props) => {
  const thumb = thumbWidth ? thumbUrl(src, thumbWidth) : src;
  const [failedThumb, setFailedThumb] = useState<string | null>(null);
  const current = failedThumb === thumb ? src : thumb;
  return (
    <img
      src={current}
      alt={alt}
      className={className}
      style={style}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={current !== src ? () => setFailedThumb(thumb) : undefined}
    />
  );
};

export default memo(ThumbImg);
