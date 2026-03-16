/**
 * Stats Footer Component
 *
 * Shows cost and token statistics.
 */

interface StatsFooterProps {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export function StatsFooter({
  totalCost,
  totalInputTokens,
  totalOutputTokens,
}: StatsFooterProps) {
  if (totalCost === 0) {
    return null;
  }

  return (
    <div className="flex justify-end gap-4 px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
      <span className="font-mono">Cost: ${totalCost.toFixed(4)}</span>
      <span className="font-mono">
        Tokens: {(totalInputTokens + totalOutputTokens).toLocaleString()}
      </span>
    </div>
  );
}
