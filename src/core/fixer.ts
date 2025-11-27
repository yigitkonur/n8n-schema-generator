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

const defaultExperimentalFixes: ExperimentalFix[] = [fixEmptyOptionsOnConditionalNodes];

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
