import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalJsonPort, type JsonObject } from '@flyingrobots/geordi-core';
import {
  FIXED_26_6_POSITION_ENCODING,
  NO_FALLBACK_POLICY,
  OUTLINE_PATHS_EVIDENCE_KIND,
  STRICT_POSITIONED_GLYPH_RUN_PROFILE,
  TEXT_PREP_BOUNDARY_PROFILE,
  TEXT_PREP_GENERATION_PLAN_FILENAME,
  TEXT_PREP_GENERATION_PLAN_VERSION,
  TEXT_PREP_GENERATED_OUTPUT_VERSION,
  TEXT_PREP_INPUT_VERSION,
  TEXT_PREP_SHAPING_FINGERPRINT_PROFILE,
  UTF8_SOURCE_ENCODING,
  measureFontLineBox,
  prepareTextPrepArtifacts,
  prepareTextPrepGenerationPlan,
  readTtfMetrics,
  sha256Utf8,
  validateTextPrepInput,
} from './index.js';
import { runTextPrepCli, type TextPrepCliIo } from './cli.js';

const HASH = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;

function textPrepFailureFixtureSource(name: string): string {
  const fixtureUrl = new URL(
    `../../../fixtures/render-everywhere/strict-text/failures/${name}.json`,
    import.meta.url,
  );

  return readFileSync(fixtureUrl, 'utf8');
}

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
      fallbackPolicy: NO_FALLBACK_POLICY,
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

function makePreparedFixtureInput(overrides: JsonObject = {}): JsonObject {
  return makeInput({
    output: {
      evidenceKind: OUTLINE_PATHS_EVIDENCE_KIND,
      fixtureId: 'render-everywhere:strict-text:generated-geordi',
      strictTextFixtureFile: 'geordi.strict-text.geordi.json',
    },
    preparedFixture: {
      glyphRuns: [
        {
          fontId: 'lato-regular',
          glyphs: [
            {
              advance: 2244,
              glyphId: 14,
              x: 0,
              xOffset: 0,
              y: 3072,
              yOffset: 0,
            },
            {
              advance: 1726,
              glyphId: 11,
              x: 2244,
              xOffset: 0,
              y: 3072,
              yOffset: 0,
            },
          ],
          id: 'run-0',
          lineBoxId: 'line-0',
        },
      ],
      lineBoxes: [
        {
          baselineY: 3072,
          height: 4096,
          id: 'line-0',
          width: 3970,
          x: 0,
          y: 0,
        },
      ],
    },
    ...overrides,
  });
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
        fallbackPolicy: 'font-fallback-chain/1',
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

  it('requires the explicit no-fallback shaping policy and rejects empty fallback fields', () => {
    const missingPolicy = validateTextPrepInput(
      makeInput({
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
      }),
    );
    const input = makeInput({
      font: {
        faceIndex: 0,
        fallbackFontIds: [],
        fontFileHash: HASH,
        fontFormat: 'ttf',
        fontId: 'lato-regular',
        fontPackHash: HASH,
        fontPackPath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
      },
      shaping: {
        direction: 'ltr',
        fallbackChain: [],
        fallbackPolicy: 'none/1',
        language: 'en',
        openTypeFeatures: [],
        script: 'Latn',
        shapingFingerprintHash: HASH,
        shapingFingerprintPath:
          'fixtures/render-everywhere/strict-text/generated/geordi.shaping-fingerprint.geordi.json',
        shapingProfile: TEXT_PREP_SHAPING_FINGERPRINT_PROFILE,
        variationAxes: [],
      },
    });

    expect(missingPolicy.ok).toBe(false);
    if (!missingPolicy.ok) {
      expect(missingPolicy.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'GEORDI_TEXT_PREP_FALLBACK_REQUIRED',
          path: '$.shaping.fallbackPolicy',
        }),
      );
    }

    const result = validateTextPrepInput(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([
          '$.font.fallbackFontIds',
          '$.shaping.fallbackChain',
          '$.shaping.fallbackPolicy',
        ]),
      );
      expect(result.diagnostics.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(['GEORDI_TEXT_PREP_FALLBACK_REQUIRED']),
      );
    }
  });

  it('keeps the committed fallback-chain text-prep fixture rejected', () => {
    const result = validateTextPrepInput(
      canonicalJsonPort.parse(
        textPrepFailureFixtureSource('fallback-chain.text-prep.input.geordi'),
      ),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(['GEORDI_TEXT_PREP_FALLBACK_REQUIRED']),
      );
      expect(result.diagnostics.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([
          '$.font.fallbackFontIds',
          '$.shaping.fallbackChain',
          '$.shaping.fallbackPolicy',
        ]),
      );
    }
  });

  it('keeps the committed multiline text-prep fixture rejected', () => {
    const result = validateTextPrepInput(
      canonicalJsonPort.parse(
        textPrepFailureFixtureSource('multiline.text-prep.input.geordi'),
      ),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'GEORDI_TEXT_PREP_UNSUPPORTED_MULTILINE',
          path: '$.source.sourceText',
        }),
      );
    }
  });

  it('keeps committed bidi and complex-script text-prep fixtures rejected', () => {
    const cases = [
      {
        name: 'bidi-rtl.text-prep.input.geordi',
        path: '$.shaping.direction',
      },
      {
        name: 'complex-script.text-prep.input.geordi',
        path: '$.shaping.script',
      },
    ] as const;

    for (const item of cases) {
      const result = validateTextPrepInput(
        canonicalJsonPort.parse(textPrepFailureFixtureSource(item.name)),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics).toContainEqual(
          expect.objectContaining({
            code: 'GEORDI_TEXT_PREP_UNSUPPORTED_BIDI',
            path: item.path,
          }),
        );
      }
    }
  });

  it('keeps the committed variable-axis text-prep fixture rejected', () => {
    const result = validateTextPrepInput(
      canonicalJsonPort.parse(
        textPrepFailureFixtureSource('variable-axis.text-prep.input.geordi'),
      ),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'GEORDI_TEXT_PREP_UNSUPPORTED_VARIABLE_AXES',
          path: '$.shaping.variationAxes',
        }),
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

  it('accepts prepared fixture data that lowers to a valid strict text fixture', () => {
    const result = validateTextPrepInput(makePreparedFixtureInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.preparedFixture?.glyphRuns).toHaveLength(1);
      expect(result.input.output.strictTextFixtureFile).toBe('geordi.strict-text.geordi.json');
    }
  });

  it('rejects prepared fixture data that cannot become a strict text fixture', () => {
    const result = validateTextPrepInput(
      makePreparedFixtureInput({
        preparedFixture: {
          glyphRuns: [
            {
              fontId: 'lato-regular',
              glyphs: [],
              id: 'run-0',
              lineBoxId: 'missing-line',
            },
          ],
          lineBoxes: [],
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((issue) => issue.code)).toContain(
        'GEORDI_TEXT_PREP_BAD_GENERATED_FIXTURE',
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
      expect(first.plan.shaping.fallbackPolicy).toBe(NO_FALLBACK_POLICY);
      expect(first.serializedPlan).not.toContain('"sourceText"');
      expect(first.serializedPlan).toContain(sha256Utf8('GEORDI'));
    }
  });

  it('emits a generated strict text fixture when prepared fixture data is present', () => {
    const source = canonicalJsonPort.stringify(makePreparedFixtureInput(), { space: 2 });
    const result = prepareTextPrepArtifacts(source);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.strictTextFixtureFile).toBe('geordi.strict-text.geordi.json');
      expect(result.serializedStrictTextFixture).toContain(
        '"fixtureVersion": "geordi-strict-text-fixture/1"',
      );
      expect(result.serializedPlan).toContain('"preparedFixtureHash": "sha256:');
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

  it('writes a generated strict text fixture when prepared fixture data is present', async () => {
    const writes = new Map<string, string>();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io: TextPrepCliIo = {
      mkdir(): Promise<void> {
        return Promise.resolve();
      },
      readFile(): Promise<string> {
        return Promise.resolve(canonicalJsonPort.stringify(makePreparedFixtureInput(), { space: 2 }));
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
    expect(writes.get('generated/geordi.strict-text.geordi.json')).toContain(
      'geordi-strict-text-fixture/1',
    );
    expect(stdout.join('')).toContain('strictTextFixturePath');
  });

  it('compares regenerated artifacts against committed bytes', async () => {
    const preparedSource = canonicalJsonPort.stringify(makePreparedFixtureInput(), { space: 2 });
    const prepared = prepareTextPrepArtifacts(preparedSource);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const stdout: string[] = [];
    const stderr: string[] = [];
    const io: TextPrepCliIo = {
      mkdir(): Promise<void> {
        return Promise.resolve();
      },
      readFile(path: string): Promise<string> {
        if (path === 'text-prep.input.geordi.json') {
          return Promise.resolve(preparedSource);
        }
        if (path === `expected/${TEXT_PREP_GENERATION_PLAN_FILENAME}`) {
          return Promise.resolve(prepared.serializedPlan);
        }
        if (path === 'expected/geordi.strict-text.geordi.json') {
          return Promise.resolve(prepared.serializedStrictTextFixture ?? '');
        }
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
      ['compare', '--input', 'text-prep.input.geordi.json', '--expected', 'expected'],
      io,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toHaveLength(0);
    expect(stdout.join('')).toContain('comparedArtifacts');
  });

  it('reports stable drift diagnostics during comparison', async () => {
    const preparedSource = canonicalJsonPort.stringify(makePreparedFixtureInput(), { space: 2 });
    const prepared = prepareTextPrepArtifacts(preparedSource);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const stdout: string[] = [];
    const stderr: string[] = [];
    const io: TextPrepCliIo = {
      mkdir(): Promise<void> {
        return Promise.resolve();
      },
      readFile(path: string): Promise<string> {
        if (path === 'text-prep.input.geordi.json') {
          return Promise.resolve(preparedSource);
        }
        if (path === `expected/${TEXT_PREP_GENERATION_PLAN_FILENAME}`) {
          return Promise.resolve(`${prepared.serializedPlan}\n`);
        }
        if (path === 'expected/geordi.strict-text.geordi.json') {
          return Promise.resolve(prepared.serializedStrictTextFixture ?? '');
        }
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
      ['compare', '--input', 'text-prep.input.geordi.json', '--expected', 'expected'],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toHaveLength(0);
    expect(stderr.join('')).toContain('GEORDI_TEXT_PREP_COMPARE_DRIFT');
    expect(stderr.join('')).toContain('actualHash');
    expect(stderr.join('')).toContain('expectedHash');
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

describe('readTtfMetrics', () => {
  function latoFontBytes(): Uint8Array {
    const fontUrl = new URL(
      '../../../fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf',
      import.meta.url,
    );
    const buf = readFileSync(fontUrl);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  it('reads stable unitsPerEm, ascender, and descender from Lato Regular', () => {
    const metrics = readTtfMetrics(latoFontBytes());

    expect(metrics.unitsPerEm).toBe(2000);
    expect(metrics.ascender).toBe(1974);
    expect(metrics.descender).toBe(-426);
  });

  it('throws TtfParseError for a truncated file', () => {
    expect(() => readTtfMetrics(new Uint8Array([0, 1, 0, 0]))).toThrow('TTF');
  });
});

describe('measureFontLineBox', () => {
  it('produces stable fixed-26.6 line box for Lato Regular at 48px/em', () => {
    const metrics = readTtfMetrics(
      new Uint8Array(
        readFileSync(
          new URL(
            '../../../fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf',
            import.meta.url,
          ),
        ).buffer,
      ),
    );
    const totalAdvance = 11550;
    const lineBox = measureFontLineBox(metrics, 48, totalAdvance);

    expect(lineBox.id).toBe('line-0');
    expect(lineBox.x).toBe(0);
    expect(lineBox.y).toBe(0);
    expect(lineBox.width).toBe(totalAdvance);
    expect(lineBox.baselineY).toBeGreaterThan(0);
    expect(lineBox.height).toBeGreaterThan(lineBox.baselineY);
  });

  it('accepts a custom line box id', () => {
    const metrics = { ascender: 800, descender: -200, unitsPerEm: 1000 };
    const lineBox = measureFontLineBox(metrics, 16, 500, 'line-1');

    expect(lineBox.id).toBe('line-1');
  });

  it('produces deterministic results for the same inputs', () => {
    const metrics = { ascender: 1974, descender: -426, unitsPerEm: 2000 };
    const first = measureFontLineBox(metrics, 48, 11550);
    const second = measureFontLineBox(metrics, 48, 11550);

    expect(first).toEqual(second);
  });
});
