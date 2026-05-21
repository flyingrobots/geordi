import { CompilerError, type CompilerErrorOptions } from './CompilerError';
import { GeordiErrorCode } from './codes';

export class InternalCompilerError extends CompilerError {
  constructor(message: string, options: CompilerErrorOptions = {}) {
    super(GeordiErrorCode.E_INTERNAL_INVARIANT, message, 'error', options);
    this.name = 'InternalCompilerError';
  }
}
