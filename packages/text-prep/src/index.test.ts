import { describe, expect, it } from 'vitest';
import { canonicalJsonPort, type JsonObject } from '@flyingrobots/geordi-core';
import {
  FIXED_26_6_POSITION_ENCODING,
  OUTLINE_PATHS_EVIDENCE_KIND,
  STRICT_POSITIONED_GLYPH_RUN_PROFILE,
  TEXT_PREP_BOUNDARY_PROFILE,
  TEXT_PREP_GENERATION_PLAN_FILENAME,
  TEXT_PREP_GENERATION_PLAN_VERSION,
  TEXT_PREP_GENERATED_OUTPUT_VERSION,
  TEXT_PREP_INPUT_VERSION,
  TEXT_PREP_SHAPING_FINGERPRINT_PROFILE,
  UTF8_SOURCE_ENCODING,
  prepareTextPrepGenerationPlan,
  sha256Utf8,
  validateTextPrepInput,
} from './index.js';
import { runTextPrepCli, type TextPrepCliIo } from './cli.js';

const HASH = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;

class TextPrepTestIoError extends Error {
  constructor() {
    super('text-prep test IO failure');
    this.name = new.target.name;
  }
}

function makeInput(overrides: JsonObject = {}): JsonObject {
  return {
    font: {
      faceIndex: 0,
      fontFileHash: HASH,
      fontFormat: 'ttf',
      fontId: 'lato-regular',
      fontPackHash: HASH,
      fontPackPath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
    },
    geometry: {
      baselinePolicy: 'font-ascent-descent/1',
      coordinateSpace: 'glyph-origin-top-left-y-down/1',
      lineBoxPolicy: 'single-line-font-bounds/1',
      positionEncoding: FIXED_26_6_POSITION_ENCODING,
      pxPerEm: 48,
      roundingPolicy: 'round-half-away-from-zero/1',
    },
    id: 'render-everywhere:strict-text:generated-geordi',
    inputVersion: TEXT_PREP_INPUT_VERSION,
    output: {
      evidenceKind: OUTLINE_PATHS_EVIDENCE_KIND,
      fixtureId: 'render-everywhere:strict-text:generated-geordi',
    },
    shaping: {
      direction: 'ltr',
      language: 'en',
      openTypeFeatures: [],
      script: 'Latn',
      shapingFingerprintHash: HASH,
      shapingFingerprintPath:
        'fixtures/render-everywhere/strict-text/generated/geordi.shaping-fingerprint.geordi.json',
      shapingProfile: TEXT_PREP_SHAPING_FINGERPRINT_PROFILE,
      variationAxes: [],
    },
    source: {
      normalizationProfile: 'unicode-nfc/15.1',
      semanticLanguage: 'en',
      sourceEncoding: UTF8_SOURCE_ENCODING,
      sourceText: 'GEORDI',
      sourceTextHash: sha256Utf8('GEORDI'),
    },
    textPrepBoundary: TEXT_PREP_BOUNDARY_PROFILE,
    textProfile: STRICT_POSITIONED_GLYPH_RUN_PROFILE,
    ...overrides,
  };
}

describe('validateTextPrepInput', () => {
  it('accepts pinned first-profile text-prep input', () => {
    const result = validateTextPrepInput(makeInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.source.sourceTextHash).toBe(sha256Utf8('GEORDI'));
      expect(result.input.font.fontPackPath).toBe(
        'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
      );
    }
  });

  it('rejects ambient host font lookup', () => {
    const input = makeInput({
      font: {
        faceIndex: 0,
        fontFileHash: HASH,
        fontFormat: 'ttf',
        fontId: 'lato-regular',
        fontPackHash: HASH,
        fontPackPath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
        hostFontFamily: 'Lato',
      },
    });

    const result = validateTextPrepInput(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((issue) => issue.code)).toContain(
        'GEORDI_TEXT_PREP_HOST_FONT_LOOKUP',
      );
    }
  });

  it('rejects fallback chains, multiline text, bidi direction, and variable axes', () => {
    const input = makeInput({
      font: {
        faceIndex: 0,
        fallbackFontIds: ['host-serif'],
        fontFileHash: HASH,
        fontFormat: 'ttf',
        fontId: 'lato-regular',
        fontPackHash: HASH,
        fontPackPath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
      },
      shaping: {
        direction: 'rtl',
        language: 'ar',
        openTypeFeatures: [],
        script: 'Arab',
        shapingFingerprintHash: HASH,
        shapingFingerprintPath:
          'fixtures/render-everywhere/strict-text/generated/geordi.shaping-fingerprint.geordi.json',
        shapingProfile: TEXT_PREP_SHAPING_FINGERPRINT_PROFILE,
        variationAxes: ['wght=700'],
      },
      source: {
        normalizationProfile: 'unicode-nfc/15.1',
        semanticLanguage: 'en',
        sourceEncoding: UTF8_SOURCE_ENCODING,
        sourceText: 'GEORDI\nTEXT',
        sourceTextHash: sha256Utf8('GEORDI\nTEXT'),
      },
    });

    const result = validateTextPrepInput(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          'GEORDI_TEXT_PREP_FALLBACK_REQUIRED',
          'GEORDI_TEXT_PREP_UNSUPPORTED_BIDI',
          'GEORDI_TEXT_PREP_UNSUPPORTED_MULTILINE',
          'GEORDI_TEXT_PREP_UNSUPPORTED_VARIABLE_AXES',
        ]),
      );
    }
  });

  it('rejects unpinned paths and source hash drift', () => {
    const input = makeInput({
      font: {
        faceIndex: 0,
        fontFileHash: HASH,
        fontFormat: 'ttf',
        fontId: 'lato-regular',
        fontPackHash: HASH,
        fontPackPath: '/Library/Fonts/Lato-Regular.ttf',
      },
      source: {
        normalizationProfile: 'unicode-nfc/15.1',
        semanticLanguage: 'en',
        sourceEncoding: UTF8_SOURCE_ENCODING,
        sourceText: 'GEORDI',
        sourceTextHash: HASH,
      },
    });

    const result = validateTextPrepInput(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(['GEORDI_TEXT_PREP_BAD_PATH', 'GEORDI_TEXT_PREP_UNSTABLE_INPUT']),
      );
    }
  });
});

describe('prepareTextPrepGenerationPlan', () => {
  it('emits a deterministic plan artifact without pixel-authoritative source text', () => {
    const source = canonicalJsonPort.stringify(makeInput(), { space: 2 });
    const first = prepareTextPrepGenerationPlan(source);
    const second = prepareTextPrepGenerationPlan(source);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.serializedPlan).toBe(second.serializedPlan);
      expect(first.plan.planVersion).toBe(TEXT_PREP_GENERATION_PLAN_VERSION);
      expect(first.plan.generatedOutputVersion).toBe(TEXT_PREP_GENERATED_OUTPUT_VERSION);
      expect(first.plan.mayFeedStrictRenderer).toBe(false);
      expect(first.serializedPlan).not.toContain('"sourceText"');
      expect(first.serializedPlan).toContain(sha256Utf8('GEORDI'));
    }
  });
});

describe('runTextPrepCli', () => {
  it('writes the generation plan to the requested output directory', async () => {
    const writes = new Map<string, string>();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io: TextPrepCliIo = {
      mkdir(): Promise<void> {
        return Promise.resolve();
      },
      readFile(): Promise<string> {
        return Promise.resolve(canonicalJsonPort.stringify(makeInput(), { space: 2 }));
      },
      stderr: {
        write(content: string): void {
          stderr.push(content);
        },
      },
      stdout: {
        write(content: string): void {
          stdout.push(content);
        },
      },
      writeFile(path: string, content: string): Promise<void> {
        writes.set(path, content);
        return Promise.resolve();
      },
    };

    const exitCode = await runTextPrepCli(
      ['prepare', '--input', 'text-prep.input.geordi.json', '--output', 'generated'],
      io,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toHaveLength(0);
    expect(writes.get(`generated/${TEXT_PREP_GENERATION_PLAN_FILENAME}`)).toContain(
      TEXT_PREP_GENERATION_PLAN_VERSION,
    );
    expect(stdout.join('')).toContain(TEXT_PREP_GENERATION_PLAN_FILENAME);
  });

  it('returns stable diagnostics for invalid input', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io: TextPrepCliIo = {
      mkdir(): Promise<void> {
        return Promise.resolve();
      },
      readFile(): Promise<string> {
        return Promise.resolve(
          canonicalJsonPort.stringify(
            makeInput({
              font: {
                faceIndex: 0,
                fontFileHash: HASH,
                fontFormat: 'ttf',
                fontId: 'lato-regular',
                fontPackHash: HASH,
                fontPackPath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
                hostFontFamily: 'Lato',
              },
            }),
          ),
        );
      },
      stderr: {
        write(content: string): void {
          stderr.push(content);
        },
      },
      stdout: {
        write(content: string): void {
          stdout.push(content);
        },
      },
      writeFile(): Promise<void> {
        return Promise.resolve();
      },
    };

    const exitCode = await runTextPrepCli(
      ['prepare', '--input', 'text-prep.input.geordi.json', '--output', 'generated'],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toHaveLength(0);
    expect(stderr.join('')).toContain('GEORDI_TEXT_PREP_HOST_FONT_LOOKUP');
  });

  it('returns stable diagnostics when input cannot be read', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io: TextPrepCliIo = {
      mkdir(): Promise<void> {
        return Promise.resolve();
      },
      readFile(): Promise<string> {
        return Promise.reject(new TextPrepTestIoError());
      },
      stderr: {
        write(content: string): void {
          stderr.push(content);
        },
      },
      stdout: {
        write(content: string): void {
          stdout.push(content);
        },
      },
      writeFile(): Promise<void> {
        return Promise.resolve();
      },
    };

    const exitCode = await runTextPrepCli(
      ['prepare', '--input', 'missing.geordi.json', '--output', 'generated'],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toHaveLength(0);
    expect(stderr.join('')).toContain('GEORDI_TEXT_PREP_IO_ERROR');
  });
});
