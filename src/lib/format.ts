export const formatPercent = (ratio: number): string => `${Math.round(ratio * 100)}%`;

export const formatPercentList = (ratios: number[]): string => ratios.map(formatPercent).join(' / ');
