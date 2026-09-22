/**
 * @nuclear/view-engine — linking subsystem barrel (C3 / P4.0.1).
 *
 * Re-exports the Node-safe link surface (P4.4): typed fail-closed errors, the
 * reused co-reference eligibility check, the structural `ViewLink` guards, the
 * semantic `assertViewLinkEligible` composition and the co-referenced link
 * application. No React, DOM, Cornerstone or resource-residency code lives
 * here.
 */
export * from './errors.js';
export * from './co-reference.js';
export * from './guards.js';
export * from './eligibility.js';
export * from './apply.js';
