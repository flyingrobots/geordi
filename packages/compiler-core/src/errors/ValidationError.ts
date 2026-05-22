import { CompilerError, type CompilerErrorOptions } from './CompilerError.js';
import type { GeordiErrorCodeValue } from './codes.js';

export class ValidationError extends CompilerError {
  constructor(code: GeordiErrorCodeValue, message: string, options: CompilerErrorOptions = {}) {
    super(code, message, 'error', options);
  }
}
