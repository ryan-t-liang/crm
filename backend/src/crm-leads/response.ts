export function crmLeadResponse<T extends { estimatedQuote: { toFixed(decimalPlaces: number): string } | null }>(row: T) {
  return {
    ...row,
    estimatedQuote: row.estimatedQuote?.toFixed(2) ?? null,
  };
}
