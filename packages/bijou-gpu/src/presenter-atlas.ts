import { assertAtlasBitmap, type AtlasBitmap, type GlyphSlotMap } from './atlas.js';
import { BijouGpuValidationError } from './errors.js';
import {
  GLYPH_ATLAS_FIRST_GENERATION,
  type GlyphAtlasDirtyRect,
  type GlyphAtlasReceiptAssets,
} from './glyph-atlas.js';
import { resolveSlotFromSlotMap, type ResolveGlyphSlot } from './surface-damage.js';

/**
 * The atlas a GPU presenter uploads and resolves glyphs through.
 *
 * A live {@link GlyphAtlas} satisfies it as is. {@link createStaticAtlasSource}
 * adapts a fixed bitmap and slot map, such as the bundled test glyph pack, so
 * a presenter can render a frame with exactly the atlas bytes the reference
 * oracle used.
 */
export interface PresenterAtlasSource {
  /** The `rgba8uint` atlas. Read it again every frame: a reset may replace it. */
  readonly bitmap: AtlasBitmap;
  readonly resolveSlot: ResolveGlyphSlot;
  /** The current generation; a change means every slot and texel is new. */
  readonly atlasGeneration: () => number;
  /** Texel regions written since the last call. Drained on every call. */
  takeDirtyRects(): GlyphAtlasDirtyRect[];
  /** Whether a reset is pending, clearing the flag. */
  consumeFullRefresh(): boolean;
  getReceiptAssets(): GlyphAtlasReceiptAssets;
}

export interface StaticAtlasSourceInput {
  readonly bitmap: AtlasBitmap;
  readonly slotMap: GlyphSlotMap;
  /** Receipt `fontIdentity`; must not be empty. */
  readonly fontIdentity: string;
}

/**
 * A {@link PresenterAtlasSource} over a fixed bitmap and slot map. Its
 * generation never changes and it never reports a dirty rectangle; a
 * presenter uploads the whole bitmap once.
 */
export function createStaticAtlasSource(input: StaticAtlasSourceInput): PresenterAtlasSource {
  assertAtlasBitmap(input.bitmap);
  if (input.fontIdentity.length === 0) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_INVALID_ATLAS',
      'staticAtlasSource.fontIdentity',
      'expected a non-empty font identity',
    );
  }
  const { bitmap, slotMap, fontIdentity } = input;
  let monoCount = 0;
  let colorEmojiCount = 0;
  for (const entry of slotMap.entries) {
    if (entry.kind === 'color') {
      colorEmojiCount += 1;
    } else {
      monoCount += 1;
    }
  }
  const assets: GlyphAtlasReceiptAssets = {
    atlasGeneration: GLYPH_ATLAS_FIRST_GENERATION,
    atlasStats: {
      usedSlots: monoCount + colorEmojiCount,
      capacity: bitmap.atlasCols * bitmap.atlasRows,
      monoCount,
      colorEmojiCount,
    },
    fontIdentity,
    cellPx: { width: bitmap.cellPxW, height: bitmap.cellPxH },
  };
  return {
    bitmap,
    resolveSlot: resolveSlotFromSlotMap(slotMap),
    atlasGeneration: () => GLYPH_ATLAS_FIRST_GENERATION,
    takeDirtyRects: () => [],
    consumeFullRefresh: () => false,
    getReceiptAssets: () => assets,
  };
}
