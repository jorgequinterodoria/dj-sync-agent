export interface ProductionArtifact {
  readonly name: string;
  readonly bytes: number;
}

export interface ProductionReleaseCheckInput {
  readonly requiredBuildArtifacts: readonly string[];
  readonly releaseArtifacts: readonly ProductionArtifact[];
}

export interface ProductionReleaseCheckResult {
  readonly ok: true;
  readonly buildArtifacts: readonly string[];
  readonly releaseArtifacts: readonly ProductionArtifact[];
}

export function validateProductionRelease(
  input: ProductionReleaseCheckInput,
): ProductionReleaseCheckResult {
  const missing = input.requiredBuildArtifacts.filter(
    (path) => path.trim().length === 0,
  );
  if (missing.length > 0) {
    throw new Error('Required build artifact paths cannot be blank.');
  }

  const invalid = input.releaseArtifacts.filter(
    (artifact) =>
      artifact.name.trim().length === 0 ||
      !Number.isFinite(artifact.bytes) ||
      artifact.bytes <= 0,
  );
  if (invalid.length > 0) {
    throw new Error('Release artifacts must be non-empty files.');
  }

  if (input.releaseArtifacts.length === 0) {
    throw new Error('No non-empty release artifacts were produced.');
  }

  return {
    ok: true,
    buildArtifacts: [...input.requiredBuildArtifacts],
    releaseArtifacts: [...input.releaseArtifacts],
  };
}
