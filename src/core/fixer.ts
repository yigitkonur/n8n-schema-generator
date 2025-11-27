import type { Workflow } from './types.js';

export interface FixResult {
  fixed: number;
  warnings: string[];
}

export interface ExperimentalFix {
  id: string;
  description: string;
  apply(workflow: Workflow): FixResult;
}

function mergeFixResults(results: FixResult[]): FixResult {
  let fixed = 0;
  const warnings: string[] = [];

  for (const result of results) {
    fixed += result.fixed;
    if (result.warnings.length) {
      warnings.push(...result.warnings);
    }
  }

  return { fixed, warnings };
}

const fixEmptyOptionsOnConditionalNodes: ExperimentalFix = {
  id: 'empty-options-if-switch',
  description: "Remove invalid empty 'options' field from the root parameters of If/Switch nodes.",
  apply(workflow: Workflow): FixResult {
    const warnings: string[] = [];
    let fixed = 0;

    if (!Array.isArray(workflow.nodes)) {
      return { fixed, warnings };
    }

    for (const node of workflow.nodes) {
      if (!node || typeof node !== 'object') continue;

      if (node.type === 'n8n-nodes-base.if' || node.type === 'n8n-nodes-base.switch') {
        const parameters = (node as any).parameters;

        if (
          parameters &&
          typeof parameters === 'object' &&
          'options' in parameters &&
          typeof (parameters as any).options === 'object' &&
          (parameters as any).options !== null &&
          Object.keys((parameters as any).options as object).length === 0
        ) {
          delete (parameters as any).options;
          fixed++;
          warnings.push(
            `Fixed node "${(node as any).name}": Removed invalid empty 'options' field from parameters root`,
          );
        }
      }
    }

    return { fixed, warnings };
  },
};

/**
 * Fix Switch v3+ rule conditions missing 'options' object.
 * Each rule's conditions must have options: { caseSensitive, leftValue, typeValidation, version }
 */
const fixSwitchV3RuleConditionsOptions: ExperimentalFix = {
  id: 'switch-v3-rule-conditions-options',
  description: "Add missing 'options' object to Switch v3+ rule conditions (required by n8n schema).",
  apply(workflow: Workflow): FixResult {
    const warnings: string[] = [];
    let fixed = 0;

    if (!Array.isArray(workflow.nodes)) {
      return { fixed, warnings };
    }

    for (const node of workflow.nodes) {
      if (!node || typeof node !== 'object') continue;

      // Only apply to Switch v3+
      if (node.type !== 'n8n-nodes-base.switch') continue;
      if (typeof node.typeVersion !== 'number' || node.typeVersion < 3) continue;

      const parameters = node.parameters as Record<string, unknown> | undefined;
      if (!parameters) continue;

      const rules = parameters.rules as Record<string, unknown> | undefined;
      if (!rules || typeof rules !== 'object') continue;

      const values = (rules as Record<string, unknown>).values as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(values)) continue;

      for (const rule of values) {
        if (!rule || typeof rule !== 'object') continue;

        const conditions = rule.conditions as Record<string, unknown> | undefined;
        if (!conditions || typeof conditions !== 'object') continue;

        // Check if options is missing or incomplete
        let needsFix = false;
        let opts = conditions.options as Record<string, unknown> | undefined;

        if (!opts || typeof opts !== 'object') {
          opts = {};
          needsFix = true;
        }

        // Ensure required fields exist
        if (!('caseSensitive' in opts)) {
          opts.caseSensitive = true;
          needsFix = true;
        }
        if (!('leftValue' in opts)) {
          opts.leftValue = '';
          needsFix = true;
        }
        if (!('typeValidation' in opts)) {
          opts.typeValidation = 'strict';
          needsFix = true;
        }
        // Add version: 2 for Switch v3.2+
        if (node.typeVersion >= 3.2 && !('version' in opts)) {
          opts.version = 2;
          needsFix = true;
        }

        if (needsFix) {
          conditions.options = opts;
          fixed++;
          warnings.push(
            `Fixed node "${node.name}": Added missing 'options' to rule conditions`,
          );
        }
      }
    }

    return { fixed, warnings };
  },
};

/**
 * Fix Switch v3+ fallbackOutput in wrong location.
 * Should be at parameters.options.fallbackOutput, not parameters.rules.fallbackOutput
 */
const fixSwitchV3FallbackOutputLocation: ExperimentalFix = {
  id: 'switch-v3-fallback-output-location',
  description: "Move 'fallbackOutput' from rules to options for Switch v3+ nodes.",
  apply(workflow: Workflow): FixResult {
    const warnings: string[] = [];
    let fixed = 0;

    if (!Array.isArray(workflow.nodes)) {
      return { fixed, warnings };
    }

    for (const node of workflow.nodes) {
      if (!node || typeof node !== 'object') continue;

      // Only apply to Switch v3+
      if (node.type !== 'n8n-nodes-base.switch') continue;
      if (typeof node.typeVersion !== 'number' || node.typeVersion < 3) continue;

      const parameters = node.parameters as Record<string, unknown> | undefined;
      if (!parameters) continue;

      const rules = parameters.rules as Record<string, unknown> | undefined;
      if (!rules || typeof rules !== 'object') continue;

      // Check if fallbackOutput is incorrectly in rules
      if ('fallbackOutput' in rules) {
        const fallbackValue = (rules as Record<string, unknown>).fallbackOutput;
        delete (rules as Record<string, unknown>).fallbackOutput;

        // Ensure options object exists
        if (!parameters.options || typeof parameters.options !== 'object') {
          parameters.options = {};
        }

        // Move to options
        (parameters.options as Record<string, unknown>).fallbackOutput = fallbackValue;
        fixed++;
        warnings.push(
          `Fixed node "${node.name}": Moved 'fallbackOutput' from rules to options`,
        );
      }
    }

    return { fixed, warnings };
  },
};

const defaultExperimentalFixes: ExperimentalFix[] = [
  fixEmptyOptionsOnConditionalNodes,
  fixSwitchV3RuleConditionsOptions,
  fixSwitchV3FallbackOutputLocation,
];

export function applyExperimentalFixes(
  workflow: Workflow,
  fixes: ExperimentalFix[] = defaultExperimentalFixes,
): FixResult {
  const results: FixResult[] = [];

  for (const fix of fixes) {
    results.push(fix.apply(workflow));
  }

  return mergeFixResults(results);
}

export function fixInvalidOptionsFields(workflow: Workflow): FixResult {
  return fixEmptyOptionsOnConditionalNodes.apply(workflow);
}

export { defaultExperimentalFixes };
