import type { WorkflowNode, ValidationIssue, IssueSeverity } from './types.js';
import { nodeRegistry } from './n8n-loader.js';
import type { INode, INodeIssues } from 'n8n-workflow';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Load n8n-workflow via CommonJS entrypoint to avoid ESM logger-proxy resolution issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const n8nWorkflowCjs = require('n8n-workflow') as any;
// Use a differently named runtime helper object to avoid clashing with type-only imports
const { NodeHelpers: CjsNodeHelpers } = n8nWorkflowCjs;

function mapSeverity(_type: string): IssueSeverity {
  // For now, treat all n8n parameter issues as errors; can refine later.
  return 'error';
}

export function validateNodeWithN8n(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Ensure node types are loaded
  nodeRegistry.init();

  const nodeTypeDescription = nodeRegistry.getNodeType(node.type, node.typeVersion);

  if (!nodeTypeDescription) {
    issues.push({
      code: 'UNKNOWN_NODE_TYPE',
      severity: 'warning',
      message: `Unknown node type: ${node.type}`,
      location: {
        nodeName: node.name,
        nodeId: node.id,
        nodeType: node.type,
      },
      context: {
        value: node.type,
        expected: 'Known n8n node type from n8n-nodes-base',
      },
    });
    return issues;
  }

  const n8nNode: INode = {
    parameters: node.parameters as any,
    name: node.name ?? '',
    type: node.type,
    typeVersion: node.typeVersion,
    position: node.position,
  } as INode;

  // First, let n8n compute normalized parameters (this will throw on severe schema issues)
  try {
    CjsNodeHelpers.getNodeParameters(
      nodeTypeDescription.properties,
      n8nNode.parameters,
      true,
      false,
      n8nNode,
      nodeTypeDescription,
    );
  } catch (error: any) {
    issues.push({
      code: 'N8N_PARAMETER_VALIDATION_ERROR',
      severity: 'error',
      message: error?.message ?? 'n8n parameter validation error',
      location: {
        nodeName: node.name,
        nodeId: node.id,
        nodeType: node.type,
      },
      context: {
        n8nError: error?.message,
        fullObject: node.parameters,
      },
    });
    // If getNodeParameters throws, getNodeParametersIssues is unlikely to add more value.
    return issues;
  }

  // Then, collect parameter-level issues using n8n's own helper
  const nodeIssues: INodeIssues | null = CjsNodeHelpers.getNodeParametersIssues(
    nodeTypeDescription.properties,
    n8nNode,
    nodeTypeDescription,
  );

  if (!nodeIssues || !nodeIssues.parameters) {
    return issues;
  }

  const parametersIssues = nodeIssues.parameters;
  if (parametersIssues && typeof parametersIssues === 'object') {
    for (const [paramName, messages] of Object.entries(parametersIssues)) {
      if (!messages) continue;

      for (const msg of messages) {
        issues.push({
          code: 'N8N_PARAMETER_ISSUE',
          severity: mapSeverity('parameters'),
          message: msg,
          location: {
            nodeName: node.name,
            nodeId: node.id,
            nodeType: node.type,
            path: `parameters.${paramName}`,
          },
          context: {
            fullObject: node.parameters,
          },
        });
      }
    }
  }

  return issues;
}
