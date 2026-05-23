import type { JsonObject } from './json.js';
import type { SourceLocation } from './source.js';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  code: string; // e.g. GEORDI_E_SCENE_MISSING
  severity: DiagnosticSeverity;
  message: string;
  location?: SourceLocation;
  hint?: string;
  details?: JsonObject;
}
