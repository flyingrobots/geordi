// The one error type of the contract gate. Every throw that reaches the command line
// becomes a schema'd `error` line on stderr (schemas/geordi-contract-gate/error.schema.json).

export class ContractGateError extends Error {
  constructor(code, message, paths = []) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.paths = paths;
  }
}

/** Process exit code of each error code. */
export const ERROR_EXIT = {
  GEORDI_E_CONTRACT_GATE_USAGE: 2,
  GEORDI_E_CONTRACT_GATE_BASE: 1,
  GEORDI_E_CONTRACT_GATE_REGISTRY: 1,
  GEORDI_E_CONTRACT_GATE_SNAPSHOT: 1,
  GEORDI_E_CONTRACT_GATE_FAILED: 1,
  GEORDI_E_CONTRACT_GATE_INTERNAL: 1,
};

export const ERROR_MEANINGS = {
  GEORDI_E_CONTRACT_GATE_USAGE: 'Invalid command line.',
  GEORDI_E_CONTRACT_GATE_BASE: 'The base cannot be determined: the base ref does not resolve, or HEAD and the base share no commit (often a shallow clone).',
  GEORDI_E_CONTRACT_GATE_REGISTRY: 'The head has no contract registry, or it or a message schema family is invalid.',
  GEORDI_E_CONTRACT_GATE_SNAPSHOT: 'A contract surface cannot be computed on one of the trees: a file is missing or unreadable, an encoder or the Rust snapshot failed.',
  GEORDI_E_CONTRACT_GATE_FAILED: 'The comparison ran and wrote one or more violation lines.',
  GEORDI_E_CONTRACT_GATE_INTERNAL: 'An unexpected failure inside the gate.',
};

export const VIOLATION_MEANINGS = {
  GEORDI_E_CONTRACT_RECORD_MISSING: 'A contract differs from the base (or is new, removed, or changed status) and no new change record names it.',
  GEORDI_E_CONTRACT_RECORD_STALE: 'A new change record names a contract that does not differ from the base.',
  GEORDI_E_CONTRACT_RECORD_UNDERSTATED: 'A change record says additive, but a difference is breaking or unknown.',
  GEORDI_E_CONTRACT_RECORD_INVALID: 'A change record does not match its schema, is not JSON, or names a contract in neither registry.',
  GEORDI_E_CONTRACT_HISTORY_REWRITTEN: 'A change record that exists on the base was edited or deleted.',
  GEORDI_E_CONTRACT_FROZEN_BREAKING: 'A frozen contract changed in a breaking (or unknown) way without a version raise.',
  GEORDI_E_CONTRACT_FROZEN_REMOVED: 'A frozen contract was removed from the registry instead of being superseded.',
  GEORDI_E_CONTRACT_STATUS_INVALID: 'A status change that is not allowed: frozen to draft, leaving superseded, a new superseded contract, or superseded without a successor.',
  GEORDI_E_CONTRACT_SUPERSEDED_CHANGED: 'A superseded contract\'s schema or example files differ from the base or were deleted.',
  GEORDI_E_CONTRACT_DIAGNOSTICS_DISAGREE: 'On the head, the diagnostic codes in the catalog and in the source disagree.',
  GEORDI_E_CONTRACT_EXAMPLE_INVALID: 'On the head, an example document is not JSON or does not validate against its contract\'s schema.',
};
