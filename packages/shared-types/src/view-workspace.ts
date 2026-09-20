/** Logical workspace and persistent interactive surface contracts. */

import type { ResourceDemand } from './availability.js';
import type {
  PreparedViewId,
  ViewGroupId,
  ViewId,
  ViewportId,
  ViewSlotId,
  SurfaceId,
} from './identifiers.js';

export type ViewSlotRole = 'MIP' | 'PET' | 'GENERIC' | 'FUSION';
export type ViewSlotStatus = 'empty' | 'bound' | 'prepared' | 'unavailable';

export interface ViewSlot {
  readonly id: ViewSlotId;
  readonly groupId: ViewGroupId;
  readonly role: ViewSlotRole;
  readonly preparedViewId?: PreparedViewId;
  readonly resourceDemand?: ResourceDemand;
  readonly status: ViewSlotStatus;
}

export interface ViewGroup {
  readonly id: ViewGroupId;
  readonly label?: string;
  readonly slotIds: readonly [ViewSlotId, ViewSlotId, ViewSlotId, ViewSlotId];
}

export type ViewportSurfaceLifecycle = 'available' | 'mounted' | 'hidden' | 'disposed';

/**
 * Stable surface identity is independent from a WebGL context. The optional
 * implementation handle is intentionally absent from this serializable type.
 */
export interface ViewportSurface {
  readonly surfaceId: SurfaceId;
  readonly viewportId: ViewportId;
  readonly boundSlotId?: ViewSlotId;
  readonly boundViewId?: ViewId;
  readonly lifecycle: ViewportSurfaceLifecycle;
}
