// Kernel conformance receipts (`geordi-bijou-gpu-kernel-receipt/1`) for the harness reports of
// `bijou-gpu-shader-harness.mjs`. Node only: it hashes with node:crypto.

import { createHash } from 'node:crypto';

export const KERNEL_RECEIPT_VERSION = 'geordi-bijou-gpu-kernel-receipt/1';

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Serializes u32 words in little-endian byte order, least-significant byte first. */
export function u32LeBytes(words) {
  const bytes = new Uint8Array(words.length * 4);
  const view = new DataView(bytes.buffer);
  words.forEach((word, index) => {
    view.setUint32(index * 4, word, true);
  });
  return bytes;
}

/**
 * Digest of the GLSL stage pair a kernel executed, framed like the manifest's
 * `generatedGlslSha256`: file name, LF, decimal byte length, LF, file bytes, for each stage.
 */
export function framedStagesSha256(stages) {
  const hash = createHash('sha256');
  for (const stage of stages) {
    hash.update(`${stage.file}\n${stage.bytes.length}\n`);
    hash.update(stage.bytes);
  }
  return hash.digest('hex');
}

function outcomeOf(report, kernel, expectedSha256, actualSha256) {
  if (!report.available) {
    return 'unavailable';
  }
  const steps = Object.values(kernel.steps);
  const passed = steps.every((step) => step.status === 'pass');
  return passed && actualSha256 === expectedSha256 ? 'pass' : 'fail';
}

/**
 * Builds one receipt per kernel. `context.kernels[i]` describes `report.kernels[i]`:
 * `{ contractId, operandLanes, vectors, vectorsBytes, stages }`.
 */
export function buildKernelReceipts(report, context) {
  return report.kernels.map((kernel, index) => {
    const described = context.kernels[index];
    const expected = described.vectors.flatMap((vector) => vector.slice(described.operandLanes));
    const expectedResultsSha256 = sha256Hex(u32LeBytes(expected));
    const actualResultsSha256 =
      kernel.actualResults === null ? null : sha256Hex(u32LeBytes(kernel.actualResults));
    return {
      receiptVersion: KERNEL_RECEIPT_VERSION,
      contractId: kernel.contractId,
      outcome: outcomeOf(report, kernel, expectedResultsSha256, actualResultsSha256),
      executionClass: report.executionClass,
      environment: report.environment,
      steps: kernel.steps,
      vectorCount: described.vectors.length,
      implementationManifestSha256: sha256Hex(context.manifestBytes),
      executionArtifactSha256: framedStagesSha256(described.stages),
      vectorsSha256: sha256Hex(described.vectorsBytes),
      expectedResultsSha256,
      actualResultsSha256,
    };
  });
}
