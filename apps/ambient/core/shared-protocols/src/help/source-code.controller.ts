import { readFile } from 'fs/promises';
import { resolve, normalize } from 'path';
import { existsSync } from 'fs';

export interface SourceCodeResponse {
  filePath: string;
  content: string;
  totalLines: number;
  startLine: number;
  endLine: number;
}

/**
 * Reads a source file from the shared-protocols package.
 * Security: only allows .ts files under packages/shared-protocols/.
 *
 * @param agentCommRoot - absolute path to the agent-communication directory
 * @param filePath - relative path like "packages/shared-protocols/src/transport/providers/a2a-jsonrpc.provider.ts"
 * @param startLine - optional 1-based start line
 * @param endLine - optional 1-based end line
 */
export async function readSourceFile(
  agentCommRoot: string,
  filePath: string,
  startLine?: number,
  endLine?: number,
): Promise<SourceCodeResponse> {
  if (!filePath) {
    throw new Error('Missing file path');
  }

  // Security: only allow .ts files under packages/shared-protocols/
  if (!filePath.startsWith('packages/shared-protocols/')) {
    throw new Error('Only files under packages/shared-protocols/ are accessible');
  }

  if (!filePath.endsWith('.ts')) {
    throw new Error('Only .ts files are accessible');
  }

  // Prevent directory traversal
  const normalizedPath = normalize(filePath);
  if (normalizedPath.includes('..')) {
    throw new Error('Directory traversal not allowed');
  }

  const absolutePath = resolve(agentCommRoot, normalizedPath);

  // Verify the resolved path is still under the allowed directory
  const allowedDir = resolve(agentCommRoot, 'packages/shared-protocols');
  if (!absolutePath.startsWith(allowedDir)) {
    throw new Error('Path resolves outside allowed directory');
  }

  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await readFile(absolutePath, 'utf-8');
  const lines = content.split('\n');
  const totalLines = lines.length;

  const effectiveStart = startLine ? Math.max(1, startLine) : 1;
  const effectiveEnd = endLine ? Math.min(totalLines, endLine) : totalLines;

  const slicedContent = lines.slice(effectiveStart - 1, effectiveEnd).join('\n');

  return {
    filePath,
    content: slicedContent,
    totalLines,
    startLine: effectiveStart,
    endLine: effectiveEnd,
  };
}
