import { CompilerError, type CompilerErrorOptions } from './CompilerError.js';
import { GeordiErrorCode } from './codes.js';

export class InternalCompilerError extends CompilerError {
  constructor(message: string, options: CompilerErrorOptions = {}) {
    super(GeordiErrorCode.E_INTERNAL_INVARIANT, message, 'error', options);
  }
}
