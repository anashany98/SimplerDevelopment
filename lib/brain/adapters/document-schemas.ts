/**
 * Shared zod/constant primitives for the Brain documents adapters
 * (documents.ts + documents-write.ts). Extracted here — rather than exported
 * from one adapter into the other — because adapters must never import each
 * other (see shared.ts). Split out of lib/brain/mcp-sdk-adapter.ts during the
 * registrar decomposition; behavior unchanged.
 */

export const DOCUMENT_CATEGORIES = ['sop', 'policy', 'guide', 'reference', 'announcement', 'other'] as const;
export const DOCUMENT_STATUSES = ['draft', 'published', 'archived'] as const;
export const DOCUMENT_LINK_ENTITY_TYPES = [
  'topic', 'initiative', 'decision', 'meeting', 'glossary_term', 'person',
] as const;
export const DOCUMENT_REQUIRED_READ_TARGETS = ['person', 'org_unit'] as const;
export const CONFIDENTIALITY_LEVELS = ['standard', 'restricted', 'confidential'] as const;
