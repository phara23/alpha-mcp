export const formatPrice = (microunits: number): string => `$${(microunits / 1e6).toFixed(2)}`;
export const formatQty = (microunits: number): string => `${(microunits / 1e6).toFixed(2)} shares`;
export const formatPriceFromProb = (probabilityPercent: number): string => `$${(probabilityPercent / 100).toFixed(2)}`;
