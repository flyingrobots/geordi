// Comparison of two contract snapshots, classification of each difference, and the rules
// that decide whether the head passes: change records, frozen contracts, version raises.
//
// Classification: removing or renaming a field, code, type, function or variant, changing a
// type, tightening validation, or changing a canonical hash is breaking. Adding an optional
// field, a new code or a new item is additive. When the gate cannot tell, the difference is
// `unknown` and is treated as breaking.
import { compareContractKeys, schemaViolation, sha256Hex, splitContract } from './snapshot.mjs';
import { canonicalJson, ContractGateJsonError, parseJson } from './json.mjs';
import { jsonEqual } from '../json-schema-subset.mjs';

// `$id` is not here: a schema's canonical URI is how other schemas reference it.
const ANNOTATIONS = new Set(['$schema', '$comment', 'title', 'description', 'examples', 'default']);
const LOWER_BOUNDS = new Set(['minimum', 'exclusiveMinimum', 'minLength', 'minItems', 'minProperties']);
const UPPER_BOUNDS = new Set(['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems', 'maxProperties']);
const SCHEMA_ARRAYS = new Set(['prefixItems', 'oneOf', 'anyOf', 'allOf']);
const RANK = { none: 0, additive: 1, breaking: 2 };

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function short(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = typeof value === 'string' ? value : canonicalJson(value);
  return text.length <= 240 ? text : null;
}

function difference(surface, item, change, classification, detail, before = null, after = null) {
  return {
    surface,
    item,
    change,
    classification,
    treatedAs: classification === 'additive' ? 'additive' : 'breaking',
    detail,
    before: short(before),
    after: short(after),
  };
}

// ---------------------------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------------------------

/** One RFC 6901 reference token. */
function token(name) {
  return String(name).replace(/~/gu, '~0').replace(/\//gu, '~1');
}

function has(object, key) {
  return Object.hasOwn(object, key);
}

function schemaKeys(schema) {
  return Object.keys(schema).filter((key) => !ANNOTATIONS.has(key) && !key.startsWith('x-'));
}

/** Differences between two JSON Schemas, walked in parallel by JSON pointer. */
export function diffSchema(before, after, pointer = '', out = [], context = { unevaluated: false }) {
  if (jsonEqual(before, after)) {
    return out;
  }
  const at = pointer === '' ? '/' : pointer;
  if (!isObject(before) || !isObject(after)) {
    out.push(difference('schema', at, 'changed', 'unknown', 'a boolean or non-object schema changed', before, after));
    return out;
  }
  const keys = [...new Set([...schemaKeys(before), ...schemaKeys(after)])].sort();
  for (const key of keys) {
    diffKeyword(key, before, after, `${pointer}/${token(key)}`, out, context);
  }
  return out;
}

function diffKeyword(key, before, after, at, out, context) {
  const b = before[key];
  const a = after[key];
  if (jsonEqual(b, a)) {
    return;
  }
  const added = b === undefined;
  const removed = a === undefined;
  if (key === 'properties') {
    diffProperties(before, after, at, out, context);
  } else if (key === 'required') {
    diffRequired(before, after, at, out);
  } else if (key === 'enum') {
    diffValues(added ? null : b, removed ? null : a, at, out, 'enum value');
  } else if (key === 'const') {
    if (added) {
      out.push(difference('schema', at, 'added', 'breaking', 'a const now restricts the value', b, a));
    } else if (removed) {
      out.push(difference('schema', at, 'removed', 'additive', 'a const no longer restricts the value', b, a));
    } else {
      out.push(difference('schema', at, 'changed', 'breaking', 'the const value changed', b, a));
    }
  } else if (key === 'type') {
    diffValues(added ? null : [b].flat(), removed ? null : [a].flat(), at, out, 'type');
  } else if (LOWER_BOUNDS.has(key) || UPPER_BOUNDS.has(key)) {
    diffBound(key, b, a, at, out);
  } else if (key === 'additionalProperties' || key === 'items') {
    if (isObject(b) && isObject(a)) {
      diffSchema(b, a, at, out, context);
    } else if (b === false || a === true || (removed && key === 'additionalProperties') || (removed && key === 'items')) {
      // Under 2020-12, unevaluatedProperties reads the annotations additionalProperties makes, so
      // loosening or removing it can change what an enclosing unevaluatedProperties rejects.
      const classification = key === 'additionalProperties' && context.unevaluated ? 'unknown' : 'additive';
      out.push(difference('schema', at, removed ? 'removed' : added ? 'added' : 'changed', classification, `${key} now allows more`, b, a));
    } else if (a === false || (added && key === 'additionalProperties' && a === false)) {
      out.push(difference('schema', at, added ? 'added' : 'changed', 'breaking', `${key} now allows less`, b, a));
    } else {
      out.push(difference('schema', at, added ? 'added' : removed ? 'removed' : 'changed', 'unknown', `${key} changed`, b, a));
    }
  } else if (SCHEMA_ARRAYS.has(key)) {
    if (Array.isArray(b) && Array.isArray(a) && b.length === a.length) {
      const inner = [];
      b.forEach((branch, index) => diffSchema(branch, a[index], `${at}/${String(index)}`, inner, context));
      for (const line of inner) {
        // Widening one oneOf branch can make a value match two branches, and so fail.
        out.push(
          key === 'oneOf' && line.classification === 'additive'
            ? { ...line, classification: 'unknown', treatedAs: 'breaking', detail: `${line.detail}; inside oneOf, a wider branch can make a value match two branches` }
            : line,
        );
      }
    } else {
      out.push(difference('schema', at, added ? 'added' : removed ? 'removed' : 'changed', 'unknown', `${key} changed its branches`, b, a));
    }
  } else if (key === '$defs') {
    diffDefinitions(b ?? {}, a ?? {}, at, out, context);
  } else if (key === 'pattern') {
    const classification = added ? 'breaking' : removed ? 'additive' : 'unknown';
    out.push(difference('schema', at, added ? 'added' : removed ? 'removed' : 'changed', classification, 'the pattern changed', b, a));
  } else if (key === 'uniqueItems') {
    out.push(difference('schema', at, 'changed', a === true ? 'breaking' : 'additive', a === true ? 'items must now be unique' : 'items need no longer be unique', b, a));
  } else {
    out.push(difference('schema', at, added ? 'added' : removed ? 'removed' : 'changed', 'unknown', `${key} changed`, b, a));
  }
}

function diffProperties(before, after, at, out, context) {
  const b = before.properties ?? {};
  const a = after.properties ?? {};
  const required = new Set(after.required ?? []);
  // An optional property is additive only when the base refused that member outright; on an open
  // object, old documents may already carry it with a value the new schema rejects.
  const closed = before.additionalProperties === false;
  for (const name of [...new Set([...Object.keys(b), ...Object.keys(a)])].sort()) {
    const path = `${at}/${token(name)}`;
    if (!has(a, name)) {
      out.push(difference('schema', path, 'removed', 'breaking', `property ${name} was removed`, b[name], null));
    } else if (!has(b, name)) {
      if (required.has(name)) {
        out.push(difference('schema', path, 'added', 'breaking', `required property ${name} was added`, null, a[name]));
      } else if (closed) {
        out.push(difference('schema', path, 'added', 'additive', `optional property ${name} was added`, null, a[name]));
      } else {
        out.push(difference('schema', path, 'added', 'unknown', `optional property ${name} was added to an object that did not refuse other members, so existing documents may hold it with a value the new schema rejects`, null, a[name]));
      }
    } else {
      diffSchema(b[name], a[name], path, out, context);
    }
  }
}

function diffRequired(before, after, at, out) {
  const beforeProps = before.properties ?? {};
  const afterProps = after.properties ?? {};
  const b = new Set(before.required ?? []);
  const a = new Set(after.required ?? []);
  for (const name of [...a].filter((item) => !b.has(item)).sort()) {
    if (has(beforeProps, name) || !has(afterProps, name)) {
      out.push(difference('schema', `${at}/${token(name)}`, 'added', 'breaking', `${name} is now required`, null, name));
    }
  }
  for (const name of [...b].filter((item) => !a.has(item)).sort()) {
    if (has(afterProps, name) || !has(beforeProps, name)) {
      out.push(difference('schema', `${at}/${token(name)}`, 'removed', 'additive', `${name} is no longer required`, name, null));
    }
  }
}

function diffValues(b, a, at, out, what) {
  if (b === null) {
    out.push(difference('schema', at, 'added', 'breaking', `a ${what} restriction was added`, null, a));
    return;
  }
  if (a === null) {
    out.push(difference('schema', at, 'removed', 'additive', `the ${what} restriction was removed`, b, null));
    return;
  }
  const lost = b.filter((value) => !a.some((other) => jsonEqual(other, value)));
  const gained = a.filter((value) => !b.some((other) => jsonEqual(other, value)));
  if (lost.length > 0) {
    out.push(difference('schema', at, 'removed', 'breaking', `${what} ${canonicalJson(lost)} no longer allowed`, b, a));
  }
  if (gained.length > 0) {
    out.push(difference('schema', at, 'added', 'additive', `${what} ${canonicalJson(gained)} now allowed`, b, a));
  }
}

function diffBound(key, b, a, at, out) {
  const lower = LOWER_BOUNDS.has(key);
  if (b === undefined) {
    out.push(difference('schema', at, 'added', 'breaking', `${key} ${String(a)} was added`, b, a));
  } else if (a === undefined) {
    out.push(difference('schema', at, 'removed', 'additive', `${key} was removed`, b, a));
  } else if (typeof a !== 'number' || typeof b !== 'number') {
    out.push(difference('schema', at, 'changed', 'unknown', `${key} changed`, b, a));
  } else {
    const tighter = lower ? a > b : a < b;
    out.push(difference('schema', at, 'changed', tighter ? 'breaking' : 'additive', `${key} ${tighter ? 'tightened' : 'loosened'} from ${String(b)} to ${String(a)}`, b, a));
  }
}

function diffDefinitions(b, a, at, out, context) {
  for (const name of [...new Set([...Object.keys(b), ...Object.keys(a)])].sort()) {
    const path = `${at}/${token(name)}`;
    if (!has(a, name)) {
      out.push(difference('schema', path, 'removed', 'unknown', `definition ${name} was removed`, b[name], null));
    } else if (!has(b, name)) {
      out.push(difference('schema', path, 'added', 'additive', `definition ${name} was added`, null, a[name]));
    } else {
      diffSchema(b[name], a[name], path, out, context);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Examples, diagnostics, Rust items
// ---------------------------------------------------------------------------------------------

function diffExamples(base, head, out) {
  for (const path of [...new Set([...base.keys(), ...head.keys()])].sort()) {
    const b = base.get(path);
    const a = head.get(path);
    if (a === undefined) {
      out.push(difference('example', path, 'removed', 'breaking', 'a canonical example document was removed from the contract', b.hash, null));
    } else if (b === undefined) {
      out.push(difference('example', path, 'added', 'additive', 'a canonical example document was added to the contract', null, a.hash));
    } else if (b.hash !== a.hash) {
      out.push(difference('example', path, 'changed', 'breaking', 'the canonical hash of the example document changed, computed by each tree\'s own encoder', b.hash, a.hash));
    }
  }
}

function diagnosticCodes(snapshot) {
  return new Set([...snapshot.catalog.keys(), ...snapshot.source]);
}

function diffDiagnostics(base, head, out) {
  const before = diagnosticCodes(base);
  const after = diagnosticCodes(head);
  for (const code of [...new Set([...before, ...after])].sort()) {
    const b = base.catalog.get(code) ?? { severity: null, message: null };
    const a = head.catalog.get(code) ?? { severity: null, message: null };
    if (!after.has(code)) {
      out.push(difference('diagnostic', code, 'removed', 'breaking', 'a public diagnostic code was removed', b.message, null));
    } else if (!before.has(code)) {
      out.push(difference('diagnostic', code, 'added', 'additive', 'a public diagnostic code was added', null, a.message));
    } else if (b.severity !== a.severity) {
      out.push(difference('diagnostic', code, 'changed', 'breaking', 'the severity of a diagnostic code changed', b.severity, a.severity));
    } else if (b.message !== a.message) {
      out.push(difference('diagnostic', code, 'changed', 'unknown', 'the documented meaning of a diagnostic code changed; it may have been narrowed or widened', b.message, a.message));
    }
  }
}

function addedRustItem(key, item, base) {
  const parent = (prefix, separator) => base.get(`${prefix} ${key.slice(key.indexOf(' ') + 1).split(separator)[0]}`);
  if (key.startsWith('field ')) {
    const owner = parent('struct', '.');
    if (owner !== undefined && owner.fieldsAllPublic === true && !owner.nonExhaustive) {
      return difference('rust-api', key, 'added', 'breaking', 'a field was added to an exhaustive struct whose fields are all public: struct literals and exhaustive patterns no longer compile', null, item.signature);
    }
  } else if (key.startsWith('variant ')) {
    const owner = parent('enum', '::');
    if (owner !== undefined && !owner.nonExhaustive) {
      return difference('rust-api', key, 'added', 'breaking', 'a variant was added to an exhaustive enum: exhaustive matches no longer compile', null, item.signature);
    }
  } else if (
    (key.startsWith('trait-fn ') && !item.signature.endsWith('{ default }')) ||
    ((key.startsWith('trait-type ') || key.startsWith('trait-const ')) && !item.signature.includes(' = '))
  ) {
    const owner = parent('trait', '::');
    if (owner !== undefined) {
      return difference('rust-api', key, 'added', 'breaking', 'a required item was added to a public trait: implementations no longer compile', null, item.signature);
    }
  }
  return difference('rust-api', key, 'added', 'additive', 'a public item was added', null, item.signature || null);
}

function changedRustItem(key, b, a) {
  if (b.signature !== a.signature) {
    if (key.startsWith('const ') && b.signature.split(' = ')[0] === a.signature.split(' = ')[0]) {
      return difference('rust-api', key, 'changed', 'unknown', 'the value of a public constant changed', b.signature, a.signature);
    }
    return difference('rust-api', key, 'changed', 'breaking', 'the signature of a public item changed', b.signature, a.signature);
  }
  if (b.reexportFrom !== a.reexportFrom) {
    return difference('rust-api', key, 'changed', 'unknown', 'a re-export now names a different item', b.reexportFrom, a.reexportFrom);
  }
  if (b.nonExhaustive !== a.nonExhaustive) {
    return difference('rust-api', key, 'changed', a.nonExhaustive ? 'breaking' : 'additive', a.nonExhaustive ? 'the item became #[non_exhaustive]' : 'the item is no longer #[non_exhaustive]', String(b.nonExhaustive), String(a.nonExhaustive));
  }
  if (b.fieldsAllPublic !== a.fieldsAllPublic) {
    return difference('rust-api', key, 'changed', a.fieldsAllPublic ? 'additive' : 'breaking', a.fieldsAllPublic ? 'every field is now public' : 'the struct gained a private field: struct literals no longer compile', String(b.fieldsAllPublic), String(a.fieldsAllPublic));
  }
  return null;
}

function diffRust(base, head, out) {
  for (const key of [...new Set([...base.keys(), ...head.keys()])].sort()) {
    const b = base.get(key);
    const a = head.get(key);
    if (a === undefined) {
      out.push(difference('rust-api', key, 'removed', 'breaking', 'a public item was removed or renamed', b.signature || null, null));
    } else if (b === undefined) {
      out.push(addedRustItem(key, a, base));
    } else {
      const changed = changedRustItem(key, b, a);
      if (changed !== null) {
        out.push(changed);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// TypeScript API of a published package
// ---------------------------------------------------------------------------------------------

function tsDifference(item, change, classification, detail, before = null, after = null) {
  return difference('typescript-api', item, change, classification, detail, before, after);
}

/** The kind of an export, and whether it is type-only: `class`, `class, type only`. */
function exportHeadline(item) {
  return `${item.kind}${item.typeOnly ? ', type only' : ''}`;
}

/** An export in one line, for an added or removed export: its kind and, where it has one, its type. */
function exportSummary(item) {
  return item.text === null ? exportHeadline(item) : `${exportHeadline(item)} ${item.text}`;
}

function diffEntries(base, head, out) {
  for (const subpath of [...new Set([...base.keys(), ...head.keys()])].sort()) {
    const b = base.get(subpath);
    const a = head.get(subpath);
    const item = `entry ${subpath}`;
    if (a === undefined) {
      out.push(tsDifference(item, 'removed', 'breaking', 'a package.json export was removed: imports of this subpath no longer resolve', b.target, null));
    } else if (b === undefined) {
      out.push(tsDifference(item, 'added', 'additive', 'a package.json export was added', null, a.target));
    } else if (b.target !== a.target) {
      out.push(tsDifference(item, 'changed', 'unknown', 'a package.json export now names a different kind of target or file; what it serves may have changed', b.target, a.target));
    }
  }
}

/** Overloads: one signature on each side that differs is a changed signature; otherwise a set difference. */
function diffSignatures(item, before, after, out, what) {
  if (before.length === 1 && after.length === 1) {
    if (before[0] !== after[0]) {
      out.push(tsDifference(item, 'changed', 'breaking', `the ${what} changed`, before[0], after[0]));
    }
    return;
  }
  for (const signature of before.filter((entry) => !after.includes(entry))) {
    out.push(tsDifference(item, 'removed', 'breaking', after.length === 0 ? `the ${what} was removed` : `an overload of the ${what} was removed or changed: calls that matched it may no longer compile`, signature, null));
  }
  for (const signature of after.filter((entry) => !before.includes(entry))) {
    out.push(
      before.length === 0
        ? tsDifference(item, 'added', 'unknown', `a ${what} was added to an item that had none`, null, signature)
        : tsDifference(item, 'added', 'additive', `an overload of the ${what} was added`, null, signature),
    );
  }
}

function addedMember(item, member) {
  if (member.owner === 'enum') {
    return tsDifference(item, 'added', 'unknown', 'a member was added to an exported enum: exhaustive switches over it may no longer compile', null, member.text);
  }
  if (member.owner === 'class' || member.optional) {
    return tsDifference(item, 'added', 'additive', member.optional ? 'an optional member was added' : 'a member was added to an exported class', null, member.text);
  }
  return tsDifference(item, 'added', 'breaking', `a required member was added to an exported ${member.owner}: object literals and implementations of it no longer compile`, null, member.text);
}

function diffMembers(prefix, before, after, out) {
  for (const name of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const b = before.get(name);
    const a = after.get(name);
    const item = `${prefix}.${name}`;
    if (a === undefined) {
      out.push(tsDifference(item, 'removed', 'breaking', 'a public member was removed or renamed', b.text, null));
    } else if (b === undefined) {
      out.push(addedMember(item, a));
    } else if (b.text !== a.text) {
      out.push(tsDifference(item, 'changed', 'breaking', 'the type, optionality or modifiers of a public member changed', b.text, a.text));
    }
  }
}

function diffExport(key, b, a, out) {
  if (b.kind !== a.kind) {
    out.push(tsDifference(`export ${key}`, 'changed', 'breaking', 'the kind of an export changed', exportHeadline(b), exportHeadline(a)));
    return;
  }
  if (b.typeOnly !== a.typeOnly) {
    out.push(
      a.typeOnly
        ? tsDifference(`export ${key}`, 'changed', 'breaking', 'the export is now type-only: it can no longer be used as a value', exportHeadline(b), exportHeadline(a))
        : tsDifference(`export ${key}`, 'changed', 'additive', 'the export can now be used as a value, not only as a type', exportHeadline(b), exportHeadline(a)),
    );
  }
  if (b.typeParameters !== a.typeParameters) {
    out.push(tsDifference(`type-parameters ${key}`, 'changed', 'breaking', 'the type parameters of an export changed', b.typeParameters || null, a.typeParameters || null));
  }
  if (b.text !== a.text) {
    out.push(tsDifference(`export ${key}`, 'changed', 'breaking', 'the type of an export changed', exportSummary(b), exportSummary(a)));
  }
  diffSignatures(`signature ${key}`, b.calls, a.calls, out, 'call signature');
  diffSignatures(`constructor ${key}`, b.constructs, a.constructs, out, 'construct signature');
  diffMembers(`member ${key}`, b.members, a.members, out);
  diffMembers(`static ${key}`, b.statics, a.statics, out);
}

function diffTypescript(base, head, out) {
  diffEntries(base?.entries ?? new Map(), head?.entries ?? new Map(), out);
  const before = base?.exports ?? new Map();
  const after = head?.exports ?? new Map();
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const b = before.get(key);
    const a = after.get(key);
    if (a === undefined) {
      out.push(tsDifference(`export ${key}`, 'removed', 'breaking', 'a public export was removed or renamed', exportSummary(b), null));
    } else if (b === undefined) {
      out.push(tsDifference(`export ${key}`, 'added', 'additive', 'a public export was added', null, exportSummary(a)));
    } else {
      diffExport(key, b, a, out);
    }
  }
}

function surfaceDifferences(base, head) {
  const out = [];
  if (base.schema !== null && head.schema !== null) {
    const unevaluated = [base.schema.document, head.schema.document].some((document) => canonicalJson(document).includes('"unevaluatedProperties"'));
    diffSchema(base.schema.document, head.schema.document, '', out, { unevaluated });
  }
  diffExamples(base.examples, head.examples, out);
  if (base.diagnostics !== null || head.diagnostics !== null) {
    diffDiagnostics(base.diagnostics ?? { catalog: new Map(), source: new Set() }, head.diagnostics ?? { catalog: new Map(), source: new Set() }, out);
  }
  if (base.rustApi !== null || head.rustApi !== null) {
    diffRust(base.rustApi ?? new Map(), head.rustApi ?? new Map(), out);
  }
  if (base.typescriptApi !== null || head.typescriptApi !== null) {
    diffTypescript(base.typescriptApi, head.typescriptApi, out);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

function violation(code, contract, message, paths = []) {
  return { code, contract, message, paths };
}

function headChecks(key, head, violations) {
  for (const [path, example] of head.examples) {
    if (example.parseError !== null) {
      violations.push(violation('GEORDI_E_CONTRACT_EXAMPLE_INVALID', key, `${path} is not JSON: ${example.parseError}`, [path]));
      continue;
    }
    const problem = schemaViolation(head.schema.document, example.document);
    if (problem !== null) {
      violations.push(violation('GEORDI_E_CONTRACT_EXAMPLE_INVALID', key, `${path} does not validate against ${head.entry.schema}: ${problem}`, [path, head.entry.schema]));
    }
  }
  if (head.diagnostics !== null) {
    const catalog = [...head.diagnostics.catalog.keys()];
    const onlyCatalog = catalog.filter((code) => !head.diagnostics.source.has(code)).sort();
    const onlySource = [...head.diagnostics.source].filter((code) => !head.diagnostics.catalog.has(code)).sort();
    if (onlyCatalog.length > 0 || onlySource.length > 0) {
      const parts = [];
      if (onlySource.length > 0) {
        parts.push(`in the source but not in ${head.entry.diagnostics.catalog}: ${onlySource.join(', ')}`);
      }
      if (onlyCatalog.length > 0) {
        parts.push(`in ${head.entry.diagnostics.catalog} but not in the source: ${onlyCatalog.join(', ')}`);
      }
      violations.push(
        violation('GEORDI_E_CONTRACT_DIAGNOSTICS_DISAGREE', key, `diagnostic codes with prefix ${head.entry.diagnostics.prefix} disagree, ${parts.join('; ')}`, [head.entry.diagnostics.catalog, ...head.entry.diagnostics.sources]),
      );
    }
  }
}

function keptFiles(key, base, head, headTree, violations) {
  const paths = [base.entry.schema, ...base.entry.examples.map((example) => example.path)];
  const headPaths = [head.entry.schema, ...head.entry.examples.map((example) => example.path)];
  if (!jsonEqual(paths, headPaths)) {
    violations.push(
      violation('GEORDI_E_CONTRACT_SUPERSEDED_CHANGED', key, `${key} is superseded, so its registry entry must keep naming the base's schema and examples (${paths.join(', ')}); it names ${headPaths.join(', ')}`, headPaths.filter((path) => !paths.includes(path))),
    );
  }
  const changed = paths.filter((path) => {
    const bytes = headTree.bytes(path);
    return bytes === null || sha256Hex(bytes) !== base.files.get(path);
  });
  if (changed.length > 0) {
    violations.push(
      violation('GEORDI_E_CONTRACT_SUPERSEDED_CHANGED', key, `${key} is superseded, so its schema and examples must stay byte for byte as on the base; changed or deleted: ${changed.join(', ')}`, changed),
    );
  }
}

function successorProblem(key, entry, headContracts) {
  if (entry.supersededBy === undefined) {
    return `${key} is superseded but names no supersededBy`;
  }
  const own = splitContract(key);
  const next = splitContract(entry.supersededBy);
  if (next.id !== own.id || next.version <= own.version || !headContracts.has(entry.supersededBy)) {
    return `${key} is superseded by ${entry.supersededBy}, which must be a higher version of ${own.id} in the head registry`;
  }
  return null;
}

/** Evaluate one contract key. Returns its differences, violations and record requirement. */
function evaluate(key, base, head, context) {
  const differences = [];
  const violations = [];
  const baseStatus = base?.entry.status ?? null;
  const headStatus = head?.entry.status ?? null;
  let state = 'unchanged';
  let needsRecord = false;
  let statusChange = null;

  if (base === undefined) {
    state = 'new';
    needsRecord = !context.bootstrap;
    if (headStatus === 'superseded') {
      violations.push(violation('GEORDI_E_CONTRACT_STATUS_INVALID', key, `${key} is new and cannot start superseded`));
    }
  } else if (head === undefined) {
    state = 'removed';
    needsRecord = true;
    if (baseStatus === 'frozen') {
      violations.push(violation('GEORDI_E_CONTRACT_FROZEN_REMOVED', key, `${key} is frozen and cannot be removed; raise the version and mark it superseded, keeping its schema and examples`, [context.registryPath]));
    } else if (baseStatus === 'superseded') {
      violations.push(violation('GEORDI_E_CONTRACT_SUPERSEDED_CHANGED', key, `${key} is superseded; its registry entry, schema and examples stay`, [context.registryPath]));
    }
  } else {
    if (baseStatus !== headStatus) {
      statusChange = { from: baseStatus, to: headStatus };
      needsRecord = true;
      differences.push(
        difference('status', 'status', 'changed', headStatus === 'superseded' ? 'breaking' : 'additive', `the contract's status changed from ${baseStatus} to ${headStatus}`, baseStatus, headStatus),
      );
      if (baseStatus === 'superseded' || (baseStatus === 'frozen' && headStatus === 'draft')) {
        violations.push(violation('GEORDI_E_CONTRACT_STATUS_INVALID', key, `${key} cannot go from ${baseStatus} to ${headStatus}`, [context.registryPath]));
      }
    }
    if (headStatus === 'superseded') {
      const problem = successorProblem(key, head.entry, context.headContracts);
      if (problem !== null) {
        violations.push(violation('GEORDI_E_CONTRACT_STATUS_INVALID', key, problem, [context.registryPath]));
      }
      keptFiles(key, base, head, context.headTree, violations);
      state = baseStatus === 'superseded' ? 'unchanged' : 'superseded';
    } else if (baseStatus !== 'superseded') {
      const surfaces = surfaceDifferences(base, head);
      differences.push(...surfaces);
      if (surfaces.length > 0) {
        needsRecord = true;
        state = 'changed';
      }
      if (baseStatus === 'frozen' && surfaces.some((line) => line.treatedAs === 'breaking')) {
        const { id, version } = splitContract(key);
        violations.push(
          violation(
            'GEORDI_E_CONTRACT_FROZEN_BREAKING',
            key,
            `${key} is frozen and changed in a breaking or unknown way; raise the version: add ${id}/${String(version + 1)} and mark ${key} superseded, keeping its schema and examples`,
          ),
        );
      }
    }
    if (state === 'unchanged' && statusChange !== null) {
      state = 'changed';
    }
  }
  if (head !== undefined && !head.superseded) {
    headChecks(key, head, violations);
  }
  let classification = 'none';
  if (state === 'new') {
    classification = 'additive';
  } else if (state === 'removed') {
    classification = 'breaking';
  }
  for (const line of differences) {
    if (RANK[line.treatedAs] > RANK[classification]) {
      classification = line.treatedAs;
    }
  }
  return { differences, violations, state, needsRecord, statusChange, classification, baseStatus, headStatus };
}

function parseRecord(path, text, knownContracts, recordSchema) {
  let record;
  try {
    record = parseJson(text);
  } catch (error) {
    if (error instanceof ContractGateJsonError) {
      return { record: null, problem: `${path} is not JSON: ${error.message}` };
    }
    throw error;
  }
  const problem = schemaViolation(recordSchema, record);
  if (problem !== null) {
    return { record: null, problem: `${path} does not match the change-record schema: ${problem}`, contract: typeof record?.contract === 'string' ? record.contract : null };
  }
  if (!knownContracts.has(record.contract)) {
    return { record: null, problem: `${path} names ${record.contract}, which is in neither the base nor the head registry`, contract: record.contract };
  }
  return { record, problem: null };
}

/**
 * Compare two snapshots. `base` is null in bootstrap mode (the base has no registry).
 * Returns the lines to write, in order.
 */
export function compare({ baseSnapshots, headSnapshots, baseRecords, headRecords, headTree, headContracts, recordSchema, registryPath }) {
  const bootstrap = baseSnapshots === null;
  const base = baseSnapshots ?? new Map();
  const keys = [...new Set([...base.keys(), ...headSnapshots.keys()])].sort(compareContractKeys);
  const evaluations = new Map(
    keys.map((key) => [key, evaluate(key, base.get(key), headSnapshots.get(key), { bootstrap, headContracts, headTree, registryPath })]),
  );

  const known = new Set(keys);
  const recordLines = [];
  const recordViolations = [];
  const byContract = new Map();
  for (const [path, entry] of baseRecords) {
    const now = headRecords.get(path);
    if (now === undefined || now.digest !== entry.digest) {
      recordViolations.push(
        violation('GEORDI_E_CONTRACT_HISTORY_REWRITTEN', null, `${path} is a change record on the base; records are history and are never edited or deleted (${now === undefined ? 'deleted' : 'edited'})`, [path]),
      );
    }
  }
  for (const [path, entry] of headRecords) {
    if (baseRecords.has(path)) {
      continue;
    }
    const parsed = parseRecord(path, entry.text, known, recordSchema);
    if (parsed.record === null) {
      recordViolations.push(violation('GEORDI_E_CONTRACT_RECORD_INVALID', parsed.contract ?? null, parsed.problem, [path]));
      recordLines.push({ path, contract: parsed.contract ?? null, change: null, state: 'invalid' });
      continue;
    }
    const line = { path, contract: parsed.record.contract, change: parsed.record.change, state: 'matched', record: parsed.record };
    if (parsed.record.retroactive === true) {
      line.state = 'retroactive';
    } else if (bootstrap) {
      line.state = 'bootstrap';
    } else {
      const list = byContract.get(parsed.record.contract) ?? [];
      list.push(line);
      byContract.set(parsed.record.contract, list);
    }
    recordLines.push(line);
  }

  const contractLines = [];
  const differenceLines = [];
  const violations = [];
  for (const key of keys) {
    const result = evaluations.get(key);
    const records = byContract.get(key) ?? [];
    const own = [...result.violations];
    const statesChange = (line) =>
      result.statusChange !== null && line.record.status?.from === result.statusChange.from && line.record.status?.to === result.statusChange.to;
    for (const line of records) {
      if (line.record.status !== undefined && !statesChange(line)) {
        line.state = 'stale';
        own.push(violation('GEORDI_E_CONTRACT_RECORD_STALE', key, `${line.path} states a status change from ${line.record.status.from} to ${line.record.status.to}, which did not happen`, [line.path]));
      }
    }
    if (result.needsRecord) {
      // One record must describe the whole change: the status change, if any, and the class.
      const fits = (line) => (result.statusChange === null || statesChange(line)) && (result.classification !== 'breaking' || line.change === 'breaking');
      if (records.length === 0) {
        own.push(violation('GEORDI_E_CONTRACT_RECORD_MISSING', key, `${key} is ${result.state} (${result.classification}) and no new change record in contracts/changes/ names it`));
      } else if (!records.some(fits)) {
        if (result.statusChange !== null && !records.some(statesChange)) {
          own.push(violation('GEORDI_E_CONTRACT_RECORD_MISSING', key, `${key} changed status from ${String(result.statusChange.from)} to ${String(result.statusChange.to)} and no change record states that status change`, records.map((line) => line.path)));
        } else {
          own.push(violation('GEORDI_E_CONTRACT_RECORD_UNDERSTATED', key, `${key} changed in a breaking or unknown way, and no single change record both says breaking and states its status change`, records.map((line) => line.path)));
        }
      }
    } else {
      for (const line of records.filter((entry) => entry.state !== 'stale')) {
        line.state = 'stale';
        own.push(violation('GEORDI_E_CONTRACT_RECORD_STALE', key, `${line.path} names ${key}, which does not differ from the base`, [line.path]));
      }
    }
    for (const line of result.differences) {
      differenceLines.push({ contract: key, ...line });
    }
    violations.push(...own);
    contractLines.push({
      contract: key,
      baseStatus: result.baseStatus,
      headStatus: result.headStatus,
      state: result.state,
      classification: result.classification,
      differences: result.differences.length,
      records: records.filter((line) => line.state === 'matched').map((line) => line.path),
      verdict: own.length === 0 ? 'pass' : 'fail',
      lines: result.differences.map((line) => ({ contract: key, ...line })),
    });
  }
  violations.push(...recordViolations);
  return {
    bootstrap,
    contracts: contractLines,
    differences: differenceLines,
    records: recordLines.map(({ path, contract, change, state }) => ({ path, contract, change, state })),
    violations,
  };
}
