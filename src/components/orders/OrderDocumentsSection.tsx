/**
 * COMPATIBILITY SHIM — the order-documents component was generalized to
 * `EntityDocumentsSection` (common/) so parties and inventory items share the
 * exact same S3 upload flow. This file keeps the old import path working.
 */
export {
  EntityDocumentsSection as OrderDocumentsSection,
  type DocumentsFeature,
  type StagedDocument,
} from '../common/EntityDocumentsSection';