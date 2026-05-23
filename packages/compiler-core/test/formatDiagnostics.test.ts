import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../src/types';
import {
  formatDiagnostic,
  formatDiagnostics,
  formatSourceLocation,
} from '../src/diagnostics';

describe('diagnostic formatter', () => {
  it('formats source locations with optional spans', () => {
    expect(formatSourceLocation({ file: 'scene.graphql', line: 2, column: 3 })).toBe(
      'scene.graphql:2:3',
    );
    expect(
      formatSourceLocation({
        file: 'scene.graphql',
        line: 2,
        column: 3,
        endLine: 2,
        endColumn: 12,
      }),
    ).toBe('scene.graphql:2:3-2:12');
  });

  it('formats a single diagnostic with stable details ordering', () => {
    const diagnostic: Diagnostic = {
      code: 'GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE',
      severity: 'error',
      message: 'Argument x must be number',
      location: {
        file: 'scene.graphql',
        line: 4,
        column: 41,
        endLine: 4,
        endColumn: 47,
      },
      hint: 'Use a numeric literal.',
      details: {
        expected: 'number',
        actual: 'string',
        argument: 'x',
      },
    };

    expect(formatDiagnostic(diagnostic)).toBe(
      [
        'error GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE scene.graphql:4:41-4:47 Argument x must be number',
        'hint: Use a numeric literal.',
        'details: {"actual":"string","argument":"x","expected":"number"}',
      ].join('\n'),
    );
  });

  it('can omit details deterministically', () => {
    const diagnostic: Diagnostic = {
      code: 'GEORDI_W_UNUSED_FIELD',
      severity: 'warning',
      message: 'Ignoring field',
      details: { field: 'extra' },
    };

    expect(formatDiagnostic(diagnostic, { includeDetails: false })).toBe(
      'warning GEORDI_W_UNUSED_FIELD Ignoring field',
    );
  });

  it('formats multiple diagnostics in input order', () => {
    const diagnostics: readonly Diagnostic[] = [
      {
        code: 'GEORDI_E_FIRST',
        severity: 'error',
        message: 'First',
      },
      {
        code: 'GEORDI_E_SECOND',
        severity: 'error',
        message: 'Second',
      },
    ];

    expect(formatDiagnostics(diagnostics)).toBe(
      ['error GEORDI_E_FIRST First', 'error GEORDI_E_SECOND Second'].join('\n\n'),
    );
  });
});
