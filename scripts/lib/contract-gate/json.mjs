/* eslint-disable no-restricted-syntax -- The contract gate must run before, and
   independently of, any built workspace package: it compares the pull request
   with its base even when the pull request breaks the build of
   @flyingrobots/geordi-core. This module is its only JSON boundary. */
// JSON for the contract gate and its tests: parsing, output lines, and the
// canonical form (sorted keys, no whitespace) that schema digests are taken over.

export class ContractGateJsonError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

/** Parse JSON text. Throws ContractGateJsonError with the parser's message. */
export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ContractGateJsonError(error instanceof Error ? error.message : String(error));
  }
}

/** JSON text of a value; `indent` as for JSON.stringify. */
export function stringifyJson(value, indent) {
  return JSON.stringify(value, null, indent);
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === 'object' && value !== null) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

/** Canonical JSON: object keys sorted by UTF-16 code unit, no whitespace. */
export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}
