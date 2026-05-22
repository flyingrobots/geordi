import type { Diagnostic } from '../types/index.js';

export class DiagnosticsError extends Error {
  public readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[], message = 'Compilation produced diagnostics') {
    super(message);
    this.name = new.target.name;
    this.diagnostics = [...diagnostics];
  }
}
