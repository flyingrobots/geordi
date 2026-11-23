import { scanTrackedFiles } from './core-artifact-literals.mjs';

class CoreArtifactLiteralError extends Error {
  constructor(violations) {
    super(`Found ${violations.length} restated core IR artifact literal(s).`);
    this.name = new.target.name;
  }
}

const violations = scanTrackedFiles();
if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  throw new CoreArtifactLiteralError(violations);
}
