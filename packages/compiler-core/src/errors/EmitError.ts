import { CompilerError, type CompilerErrorOptions } from './CompilerError';
import type { GeordiErrorCodeValue } from './codes';

export class EmitError extends CompilerError {
  constructor(code: GeordiErrorCodeValue, message: string, options: CompilerErrorOptions = {}) {
    super(code, message, 'error', options);
    this.name = 'EmitError';
  }
}
