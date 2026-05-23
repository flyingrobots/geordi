import {
  GEORDI_BASELINE_FEATURES,
  GEORDI_IR_VERSION,
  GEORDI_NUMERIC_PROFILE,
  type GeordiFeatureRequirement,
  type GeordiNumericProfile,
} from '@flyingrobots/geordi-core';

export type GeordiRuntimeNodeKind = 'Rect' | 'Text' | 'Group' | 'Image';

export type GeordiRuntimeVisualFeature =
  | 'solid-fill'
  | 'solid-stroke'
  | 'opacity'
  | 'corner-radius'
  | 'text-fill';

export interface GeordiRuntimeProfile {
  readonly irVersion: typeof GEORDI_IR_VERSION;
  readonly numericProfile: GeordiNumericProfile;
  readonly featureRequirements: readonly GeordiFeatureRequirement[];
  readonly nodeKinds: readonly GeordiRuntimeNodeKind[];
  readonly visualFeatures: readonly GeordiRuntimeVisualFeature[];
}

export const GEORDI_WEBGL_RUNTIME_PROFILE: GeordiRuntimeProfile = {
  irVersion: GEORDI_IR_VERSION,
  numericProfile: GEORDI_NUMERIC_PROFILE,
  featureRequirements: GEORDI_BASELINE_FEATURES,
  nodeKinds: ['Rect', 'Text', 'Group', 'Image'],
  visualFeatures: ['solid-fill', 'solid-stroke', 'opacity', 'corner-radius', 'text-fill'],
};

export class GeordiRuntimeUnsupportedProfileError extends Error {
  public readonly requirement: string;
  public readonly supported: string;

  constructor(requirement: string, supported: string) {
    super('Unsupported runtime profile');
    this.name = new.target.name;
    this.requirement = requirement;
    this.supported = supported;
  }
}

interface RuntimeProfileRequirement {
  readonly irVersion: string;
  readonly numericProfile?: string;
  readonly requires?: readonly string[];
}

export function assertSupportedRuntimeProfile(
  ir: RuntimeProfileRequirement,
  profile: GeordiRuntimeProfile = GEORDI_WEBGL_RUNTIME_PROFILE,
): void {
  if (ir.irVersion !== profile.irVersion) {
    throw new GeordiRuntimeUnsupportedProfileError(
      `irVersion=${ir.irVersion}`,
      `irVersion=${profile.irVersion}`,
    );
  }

  if (ir.numericProfile !== profile.numericProfile) {
    throw new GeordiRuntimeUnsupportedProfileError(
      `numericProfile=${String(ir.numericProfile)}`,
      `numericProfile=${profile.numericProfile}`,
    );
  }

  if (!Array.isArray(ir.requires)) {
    throw new GeordiRuntimeUnsupportedProfileError(
      'requires=<missing>',
      `requires=${profile.featureRequirements.join(',')}`,
    );
  }

  const supportedFeatureRequirements = new Set<string>(profile.featureRequirements);
  for (const [index, requirement] of ir.requires.entries()) {
    if (typeof requirement !== 'string') {
      throw new GeordiRuntimeUnsupportedProfileError(
        `requires[${index}]=${String(requirement)}`,
        `requires=${profile.featureRequirements.join(',')}`,
      );
    }

    if (!supportedFeatureRequirements.has(requirement)) {
      throw new GeordiRuntimeUnsupportedProfileError(
        `requires=${requirement}`,
        `requires=${profile.featureRequirements.join(',')}`,
      );
    }
  }
}
