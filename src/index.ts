export { jsonParse } from './core/json-parser.js';
export { validateWorkflowStructure, type ValidateOptions } from './core/validator.js';
export { validateNodeWithN8n } from './core/n8n-native-validator.js';
export { nodeRegistry } from './core/n8n-loader.js';
export { fixInvalidOptionsFields, applyExperimentalFixes, type ExperimentalFix, type FixResult } from './core/fixer.js';
export { sanitizeWorkflow } from './core/sanitizer.js';
export { createSourceMap, findSourceLocation, extractSnippet } from './core/source-location.js';
export type { 
  Workflow, 
  WorkflowNode, 
  ValidationResult, 
  ValidationSummary,
  ValidationIssue,
  SourceLocation,
  SourceSnippet,
  IssueSeverity
} from './core/types.js';
