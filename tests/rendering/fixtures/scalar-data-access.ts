/**
 * NuClear C8 corrective — fail-closed access to a volume's complete scalar data.
 *
 * Cornerstone types `IVoxelManager.getCompleteScalarDataArray` as optional
 * (`getCompleteScalarDataArray?: () => ArrayLike<number>`). A volume probe that
 * reports scalar corner values must not silently fall back to empty data if the
 * method is absent: the method is REQUIRED here, so its absence is an explicit
 * failure. This module is Node-safe (no Cornerstone import) so the guard is
 * unit-testable outside the browser.
 */

/** Structural view of the voxel-manager method the probe depends on. */
export interface VoxelScalarDataSource {
  readonly getCompleteScalarDataArray?: () => ArrayLike<number>;
}

/**
 * Returns the complete scalar data, or throws when the source or the method is
 * unavailable. The method is invoked with the source as `this` so a real
 * `VoxelManager` keeps its binding.
 */
export function requireCompleteScalarData(
  source: VoxelScalarDataSource | undefined,
  context: string,
): ArrayLike<number> {
  const read = source?.getCompleteScalarDataArray;
  if (source === undefined || read === undefined) {
    throw new Error(
      `${context}: voxelManager.getCompleteScalarDataArray is required to read complete scalar data but is unavailable.`,
    );
  }
  return read.call(source);
}
