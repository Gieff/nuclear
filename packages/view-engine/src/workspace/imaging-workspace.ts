/**
 * @nuclear/view-engine — serializable ImagingWorkspace core (P4.1).
 *
 * Owns semantic references only: studies, imaging assets and the logical
 * `ViewGroup`/`ViewSlot` layout. It is not React state, a DOM tree or a
 * Cornerstone `RenderingEngine`, and it never pins RAM or VRAM (ADR-010 §1).
 * Outputs are JSON-serializable deep copies; unknown or duplicate ids fail
 * closed with a typed `WorkspaceError`.
 */
import type {
  AssetId,
  ImagingAsset,
  StudyId,
  StudyInstanceUID,
  StudyReference,
  ViewGroup,
  ViewSlot,
} from '@nuclear/shared-types';
import { WorkspaceError } from './errors.js';
import { ViewSlotRegistry } from './view-slot-registry.js';

export interface ImagingWorkspaceSnapshot {
  readonly studies: readonly StudyReference[];
  readonly assets: readonly ImagingAsset[];
  readonly groups: readonly ViewGroup[];
  readonly slots: readonly ViewSlot[];
}

/**
 * JSON-serializable deep copy of a value object. NuClear value contracts are
 * plain JSON (strings, numbers, booleans, arrays and plain objects); callers
 * must not register a payload containing `Date`, `Map`, `Set`, `bigint`,
 * `NaN` or `-0`, which this copy would silently alter.
 */
function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ImagingWorkspace {
  readonly slots: ViewSlotRegistry;

  private readonly studyById = new Map<StudyId, StudyReference>();
  private readonly studyOrder: StudyId[] = [];
  private readonly assetById = new Map<AssetId, ImagingAsset>();
  private readonly assetOrder: AssetId[] = [];
  private readonly studyInstanceUIDs = new Set<StudyInstanceUID>();

  constructor(options: { slotRegistry?: ViewSlotRegistry } = {}) {
    this.slots = options.slotRegistry ?? ViewSlotRegistry.createDefault();
  }

  registerStudy(study: StudyReference): void {
    if (this.studyById.has(study.id)) {
      throw new WorkspaceError(
        'WORKSPACE_DUPLICATE_STUDY',
        `Study id '${study.id}' is already registered. Remediation: reuse the registered study or register it under a distinct StudyId.`,
      );
    }
    this.studyById.set(study.id, cloneValue(study));
    this.studyOrder.push(study.id);
    this.studyInstanceUIDs.add(study.studyInstanceUID);
  }

  registerAsset(asset: ImagingAsset): void {
    if (this.assetById.has(asset.id)) {
      throw new WorkspaceError(
        'WORKSPACE_DUPLICATE_ASSET',
        `Asset id '${asset.id}' is already registered. Remediation: reuse the registered asset or register it under a distinct AssetId.`,
      );
    }
    if (!this.studyInstanceUIDs.has(asset.studyInstanceUID)) {
      throw new WorkspaceError(
        'WORKSPACE_UNKNOWN_STUDY',
        `Asset '${asset.id}' references study instance UID '${asset.studyInstanceUID}', which has no registered study. Remediation: register the owning StudyReference before its assets.`,
      );
    }
    this.assetById.set(asset.id, cloneValue(asset));
    this.assetOrder.push(asset.id);
  }

  getStudy(studyId: StudyId): StudyReference {
    return cloneValue(this.requireStudy(studyId));
  }

  getAsset(assetId: AssetId): ImagingAsset {
    return cloneValue(this.requireAsset(assetId));
  }

  listStudies(): readonly StudyReference[] {
    return this.studyOrder.map((studyId) => cloneValue(this.requireStudy(studyId)));
  }

  listAssets(): readonly ImagingAsset[] {
    return this.assetOrder.map((assetId) => cloneValue(this.requireAsset(assetId)));
  }

  snapshot(): ImagingWorkspaceSnapshot {
    const layout = this.slots.snapshot();
    return {
      studies: this.listStudies(),
      assets: this.listAssets(),
      groups: layout.groups,
      slots: layout.slots,
    };
  }

  private requireStudy(studyId: StudyId): StudyReference {
    const study = this.studyById.get(studyId);
    if (study === undefined) {
      throw new WorkspaceError(
        'WORKSPACE_UNKNOWN_STUDY',
        `Unknown study id '${studyId}'. Remediation: register the study before referencing it.`,
      );
    }
    return study;
  }

  private requireAsset(assetId: AssetId): ImagingAsset {
    const asset = this.assetById.get(assetId);
    if (asset === undefined) {
      throw new WorkspaceError(
        'WORKSPACE_UNKNOWN_ASSET',
        `Unknown asset id '${assetId}'. Remediation: register the asset before referencing it.`,
      );
    }
    return asset;
  }
}
