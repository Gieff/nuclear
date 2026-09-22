/**
 * @nuclear/view-engine — serializable ImagingWorkspace core (P4.1).
 *
 * Owns semantic references only: studies, imaging assets and the logical
 * `ViewGroup`/`ViewSlot` layout. It is not React state, a DOM tree or a
 * Cornerstone `RenderingEngine`, and it never pins RAM or VRAM (ADR-010 §1).
 * Registration validates the caller's original value fail-closed before any
 * state changes (C1). Registered studies/assets are cloned, then deep-frozen;
 * reads and `snapshot()` return those stored frozen values by identity, so a
 * consumer cannot mutate canonical workspace state (ADR-011 §1). Unknown or
 * duplicate workspace ids fail closed with a typed `WorkspaceError`.
 * Prepared-view provenance is cross-validated positionally (C5) and slot
 * binding is an explicit fail-closed operation (C6), both raising a typed
 * `PreparedViewError`.
 */
import type {
  AssetId,
  ImagingAsset,
  PreparedView,
  PreparedViewId,
  StudyId,
  StudyInstanceUID,
  StudyReference,
  ViewGroup,
  ViewSlot,
  ViewSlotId,
} from '@nuclear/shared-types';
import { WorkspaceError } from './errors.js';
import { ViewSlotRegistry } from './view-slot-registry.js';
import { PreparedViewRegistry } from '../prepared-view/registry.js';
import { PreparedViewError } from '../prepared-view/errors.js';
import { assertProvenanceCorrelation } from '../prepared-view/provenance-correlation.js';
import { cloneSerializableValue } from './value-integrity.js';
import { deepFreeze } from '../internal/deep-freeze.js';
import { SharedStateGroupRegistry } from '../shared-state/registry.js';
import type { SharedStateGroupSnapshot } from '../shared-state/types.js';
import { applyCoReferencedLink } from '../linking/apply.js';
import type { AppliedCoReferencedLink, ApplyCoReferencedLinkInput } from '../linking/apply.js';

export interface ImagingWorkspaceSnapshot {
  readonly studies: readonly StudyReference[];
  readonly assets: readonly ImagingAsset[];
  readonly groups: readonly ViewGroup[];
  readonly slots: readonly ViewSlot[];
  readonly preparedViews: readonly PreparedView[];
  readonly sharedStateGroups: readonly SharedStateGroupSnapshot[];
}

export class ImagingWorkspace {
  readonly slots: ViewSlotRegistry;
  readonly preparedViews: PreparedViewRegistry;
  readonly sharedStateGroups: SharedStateGroupRegistry;

  private readonly studyById = new Map<StudyId, StudyReference>();
  private readonly studyOrder: StudyId[] = [];
  private readonly assetById = new Map<AssetId, ImagingAsset>();
  private readonly assetOrder: AssetId[] = [];
  private readonly studyInstanceUIDs = new Set<StudyInstanceUID>();

  constructor(options: { slotRegistry?: ViewSlotRegistry } = {}) {
    this.slots = options.slotRegistry ?? ViewSlotRegistry.createDefault();
    this.preparedViews = new PreparedViewRegistry();
    this.sharedStateGroups = new SharedStateGroupRegistry(this.preparedViews);
  }

  registerStudy(study: StudyReference): void {
    // Validate the caller's original value before touching any map/Set, so a
    // refusal leaves the workspace exactly as it was (C1, fail-closed). The
    // clone (never the caller's object) is frozen before it is stored.
    const registered = deepFreeze(cloneSerializableValue(study, `study '${study.id}'`));
    if (this.studyById.has(study.id)) {
      throw new WorkspaceError(
        'WORKSPACE_DUPLICATE_STUDY',
        `Study id '${study.id}' is already registered. Remediation: reuse the registered study or register it under a distinct StudyId.`,
      );
    }
    this.studyById.set(study.id, registered);
    this.studyOrder.push(study.id);
    this.studyInstanceUIDs.add(study.studyInstanceUID);
  }

  registerAsset(asset: ImagingAsset): void {
    // Validate the caller's original value before touching any map, so a
    // refusal leaves the workspace exactly as it was (C1, fail-closed). The
    // clone (never the caller's object) is frozen before it is stored.
    const registered = deepFreeze(cloneSerializableValue(asset, `asset '${asset.id}'`));
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
    this.assetById.set(asset.id, registered);
    this.assetOrder.push(asset.id);
  }

  registerPreparedView(view: PreparedView): PreparedView {
    for (const assetId of view.provenance.sourceAssetIds) {
      if (!this.assetById.has(assetId)) {
        throw new WorkspaceError(
          'WORKSPACE_UNKNOWN_ASSET',
          `Prepared view '${view.id}' references provenance source asset id '${assetId}', which is not registered. Remediation: register the asset (and its owning study) before registering the prepared view.`,
        );
      }
    }
    // Recorded error precedence (C1 handover §3): integrity/existence →
    // duplicate → correlation. The duplicate id is checked here, before the
    // correlation, so a payload that is both a duplicate and incoherent
    // reports the duplicate, not a correlation mismatch.
    if (this.preparedViews.has(view.id)) {
      throw new PreparedViewError(
        'PREPARED_VIEW_DUPLICATE_ID',
        `Prepared view id '${view.id}' is already registered. Remediation: reuse the registered prepared view or assemble it under a distinct PreparedViewId.`,
      );
    }
    // C5: positional provenance correlation runs against the **stored
    // validated** assets (never the caller's mutable object). Registration is
    // read-only until every check passes, so a refusal leaves the workspace
    // and the caller's view untouched.
    assertProvenanceCorrelation({
      preparedViewId: view.id,
      provenance: view.provenance,
      lookupAsset: (assetId) => this.assetById.get(assetId),
    });
    // The registry deep-freezes defensively after the duplicate check, so a
    // hand-built view is frozen too and a refusal never freezes the caller.
    return this.preparedViews.register(view);
  }

  /**
   * Explicit, fail-closed slot → prepared-view binding (C6).
   *
   * Precedence (documented): the prepared view must exist first
   * (`PREPARED_VIEW_UNKNOWN_ID`), then the slot transition is delegated to
   * `ViewSlotRegistry.bind`, which enforces `empty`/`unavailable` → `bound`
   * and throws `WORKSPACE_UNKNOWN_SLOT` or
   * `WORKSPACE_ILLEGAL_SLOT_TRANSITION`. Slot binding is deliberately **not**
   * a prerequisite for registration or assembly: a registered prepared view
   * with zero bound slots is legal.
   */
  bindSlotToPreparedView(slotId: ViewSlotId, preparedViewId: PreparedViewId): ViewSlot {
    if (!this.preparedViews.has(preparedViewId)) {
      throw new PreparedViewError(
        'PREPARED_VIEW_UNKNOWN_ID',
        `Unknown prepared view id '${preparedViewId}' cannot be bound to view slot '${slotId}'. Remediation: assemble and register the prepared view before binding a slot to it.`,
      );
    }
    return this.slots.bind(slotId, preparedViewId);
  }

  /**
   * Applies a co-referenced link between two registered prepared views through
   * the P4.3 atomic projection path (P4.4): it validates eligibility, resolves
   * or creates the shared-state group, attaches both views and regenerates each
   * frozen projection with the recorded link. It never mutates a published or
   * frozen view in place. Delegates to `applyCoReferencedLink` with this
   * workspace's prepared-view/shared-state registries and asset lookup.
   */
  applyCoReferencedLink(
    request: Omit<ApplyCoReferencedLinkInput, 'preparedViews' | 'sharedStateGroups' | 'lookupAsset'>,
  ): AppliedCoReferencedLink {
    return applyCoReferencedLink({
      ...request,
      preparedViews: this.preparedViews,
      sharedStateGroups: this.sharedStateGroups,
      lookupAsset: (assetId) => this.assetById.get(assetId),
    });
  }

  getPreparedView(preparedViewId: PreparedViewId): PreparedView {
    return this.preparedViews.get(preparedViewId);
  }

  listPreparedViews(): readonly PreparedView[] {
    return this.preparedViews.list();
  }

  // Stored studies/assets were validated, cloned and frozen at registration;
  // reads return those same frozen values and only the ordering arrays are
  // materialised afresh (and frozen) per call.

  getStudy(studyId: StudyId): StudyReference {
    return this.requireStudy(studyId);
  }

  getAsset(assetId: AssetId): ImagingAsset {
    return this.requireAsset(assetId);
  }

  listStudies(): readonly StudyReference[] {
    return deepFreeze(this.studyOrder.map((studyId) => this.requireStudy(studyId)));
  }

  listAssets(): readonly ImagingAsset[] {
    return deepFreeze(this.assetOrder.map((assetId) => this.requireAsset(assetId)));
  }

  snapshot(): ImagingWorkspaceSnapshot {
    const layout = this.slots.snapshot();
    return deepFreeze({
      studies: this.listStudies(),
      assets: this.listAssets(),
      groups: layout.groups,
      slots: layout.slots,
      // Studies, assets and slots are frozen clones, while prepared views are
      // returned by reference so the shared `MedicalViewState` object identity
      // stays observable (ADR-010 §1 / ADR-011 §1). Freezing, not cloning,
      // provides the immutability guarantee. Do not "fix" this by cloning.
      preparedViews: this.listPreparedViews(),
      sharedStateGroups: this.sharedStateGroups.snapshot(),
    });
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
