import type { CSSProperties } from 'react';

export const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars as CSSProperties;
