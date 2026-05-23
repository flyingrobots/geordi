import type { Diagnostic, SourceLocation } from '../types/index.js';
import { stringifyCanonicalJson } from '../ports/json.js';

export interface DiagnosticFormatOptions {
  readonly includeDetails?: boolean;
}

const DEFAULT_FORMAT_OPTIONS: Required<DiagnosticFormatOptions> = {
  includeDetails: true,
};

export function formatDiagnostic(
  diagnostic: Diagnostic,
  options: DiagnosticFormatOptions = {},
): string {
  const resolvedOptions = { ...DEFAULT_FORMAT_OPTIONS, ...options };
  const location = diagnostic.location ? `${formatSourceLocation(diagnostic.location)} ` : '';
  const lines = [
    `${diagnostic.severity} ${diagnostic.code} ${location}${diagnostic.message}`,
  ];

  if (diagnostic.hint) {
    lines.push(`hint: ${diagnostic.hint}`);
  }

  if (resolvedOptions.includeDetails && diagnostic.details) {
    lines.push(`details: ${stringifyCanonicalJson(diagnostic.details)}`);
  }

  return lines.join('\n');
}

export function formatDiagnostics(
  diagnostics: readonly Diagnostic[],
  options: DiagnosticFormatOptions = {},
): string {
  return diagnostics.map((diagnostic) => formatDiagnostic(diagnostic, options)).join('\n\n');
}

export function formatSourceLocation(location: SourceLocation): string {
  const start = `${location.file}:${location.line}:${location.column}`;
  if (location.endLine === undefined || location.endColumn === undefined) {
    return start;
  }

  return `${start}-${location.endLine}:${location.endColumn}`;
}
