import {
  assertRenderFixtureStrictTextEvidenceCoverage,
  assertRenderFixtureStrictTextEvidenceLineBoxes,
  type RenderFixtureGlyphRun,
  type RenderFixturePositionedGlyph,
  type RenderFixtureStrictTextFixtureManifest,
  type RenderFixtureStrictTextOutlineCommand,
  type RenderFixtureStrictTextOutlineEvidenceGlyph,
  type RenderFixtureStrictTextOutlineEvidencePack,
} from '@flyingrobots/geordi-render-fixture';

export const BROWSER_STRICT_TEXT_OUTLINE_RENDERER_NAME =
  'browser-canvas-outline-glyphs' as const;

const FIXED_26_6_SCALE = 64;

export interface BrowserStrictTextOutlineRenderReport {
  readonly commandCount: number;
  readonly drawGlyphCount: number;
  readonly evidenceKind: string;
  readonly evidencePackId: string;
  readonly fixtureId: string;
  readonly glyphCount: number;
  readonly rendererName: typeof BROWSER_STRICT_TEXT_OUTLINE_RENDERER_NAME;
  readonly textProfile: string;
}

export interface BrowserStrictTextOutlineRenderResult {
  readonly canvas: HTMLCanvasElement;
  readonly evidence: RenderFixtureStrictTextOutlineEvidencePack;
  readonly fixture: RenderFixtureStrictTextFixtureManifest;
  readonly report: BrowserStrictTextOutlineRenderReport;
}

export class BrowserStrictTextCanvasContextError extends Error {
  constructor() {
    super('Browser strict text canvas context failed');
    this.name = new.target.name;
  }
}

export function renderStrictTextOutlineGlyphsToCanvas(
  fixture: RenderFixtureStrictTextFixtureManifest,
  evidence: RenderFixtureStrictTextOutlineEvidencePack,
): BrowserStrictTextOutlineRenderResult {
  assertRenderFixtureStrictTextEvidenceCoverage({ evidence, fixture });
  assertRenderFixtureStrictTextEvidenceLineBoxes({ evidence, fixture });

  const canvas = document.createElement('canvas');
  canvas.width = fixedToCanvasPixels(maxLineBoxRight(fixture));
  canvas.height = fixedToCanvasPixels(maxLineBoxBottom(fixture));
  canvas.setAttribute('data-geordi-strict-text-canvas', 'true');
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new BrowserStrictTextCanvasContextError();
  }

  const report = renderStrictTextOutlineGlyphs(context, fixture, evidence);

  return {
    canvas,
    evidence,
    fixture,
    report,
  };
}

export function renderStrictTextOutlineGlyphs(
  context: CanvasRenderingContext2D,
  fixture: RenderFixtureStrictTextFixtureManifest,
  evidence: RenderFixtureStrictTextOutlineEvidencePack,
): BrowserStrictTextOutlineRenderReport {
  assertRenderFixtureStrictTextEvidenceCoverage({ evidence, fixture });
  assertRenderFixtureStrictTextEvidenceLineBoxes({ evidence, fixture });

  const glyphEvidence = new Map<number, RenderFixtureStrictTextOutlineEvidenceGlyph>();
  for (const glyph of evidence.glyphs) {
    glyphEvidence.set(glyph.glyphId, glyph);
  }

  let glyphCount = 0;
  let drawGlyphCount = 0;
  let commandCount = 0;
  context.save();
  context.fillStyle = rgbaCss(evidence.paint.rgba);
  context.beginPath();

  for (const run of fixture.glyphRuns) {
    for (const glyph of run.glyphs) {
      glyphCount += 1;
      const evidenceGlyph = glyphEvidence.get(glyph.glyphId);
      if (evidenceGlyph?.draws !== true) {
        continue;
      }

      drawGlyphCount += 1;
      commandCount += evidenceGlyph.commands.length;
      appendGlyphPath(context, run, glyph, evidenceGlyph);
    }
  }

  context.fill('nonzero');
  context.restore();

  return {
    commandCount,
    drawGlyphCount,
    evidenceKind: evidence.evidenceKind,
    evidencePackId: evidence.id,
    fixtureId: fixture.id,
    glyphCount,
    rendererName: BROWSER_STRICT_TEXT_OUTLINE_RENDERER_NAME,
    textProfile: fixture.textProfile,
  };
}

function appendGlyphPath(
  context: CanvasRenderingContext2D,
  run: RenderFixtureGlyphRun,
  positionedGlyph: RenderFixturePositionedGlyph,
  evidenceGlyph: RenderFixtureStrictTextOutlineEvidenceGlyph,
): void {
  if (run.fontId.length === 0) {
    return;
  }

  const originX = positionedGlyph.x + positionedGlyph.xOffset;
  const originY = positionedGlyph.y + positionedGlyph.yOffset;
  for (const command of evidenceGlyph.commands) {
    appendCommand(context, command, originX, originY);
  }
}

function appendCommand(
  context: CanvasRenderingContext2D,
  command: RenderFixtureStrictTextOutlineCommand,
  originX: number,
  originY: number,
): void {
  switch (command.op) {
    case 'moveTo':
      context.moveTo(fixedToCanvasPixels(originX + command.x), fixedToCanvasPixels(originY + command.y));
      break;
    case 'lineTo':
      context.lineTo(fixedToCanvasPixels(originX + command.x), fixedToCanvasPixels(originY + command.y));
      break;
    case 'quadTo':
      context.quadraticCurveTo(
        fixedToCanvasPixels(originX + command.cx),
        fixedToCanvasPixels(originY + command.cy),
        fixedToCanvasPixels(originX + command.x),
        fixedToCanvasPixels(originY + command.y),
      );
      break;
    case 'cubicTo':
      context.bezierCurveTo(
        fixedToCanvasPixels(originX + command.cx1),
        fixedToCanvasPixels(originY + command.cy1),
        fixedToCanvasPixels(originX + command.cx2),
        fixedToCanvasPixels(originY + command.cy2),
        fixedToCanvasPixels(originX + command.x),
        fixedToCanvasPixels(originY + command.y),
      );
      break;
    case 'closePath':
      context.closePath();
      break;
  }
}

function maxLineBoxRight(fixture: RenderFixtureStrictTextFixtureManifest): number {
  return Math.max(...fixture.lineBoxes.map((lineBox) => lineBox.x + lineBox.width));
}

function maxLineBoxBottom(fixture: RenderFixtureStrictTextFixtureManifest): number {
  return Math.max(...fixture.lineBoxes.map((lineBox) => lineBox.y + lineBox.height));
}

function fixedToCanvasPixels(value: number): number {
  return value / FIXED_26_6_SCALE;
}

function rgbaCss(rgba: readonly [number, number, number, number]): string {
  return `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3] / 255})`;
}
