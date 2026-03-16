let strictMode = false;

export function enableStrictBoundaryMode(): void { strictMode = true; }
export function disableStrictBoundaryMode(): void { strictMode = false; }
export function isStrictBoundaryMode(): boolean { return strictMode; }

export function assertCrossAgentBoundary(callerAgent: string, targetAgent: string): void {
  if (strictMode && callerAgent !== targetAgent) {
    throw new Error(
      `Strict boundary violation: ${callerAgent} attempted in-process call to ${targetAgent}. ` +
      `Cross-agent calls must use HTTP when strict boundary mode is enabled.`,
    );
  }
}
