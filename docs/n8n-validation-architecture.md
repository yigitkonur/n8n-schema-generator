# n8n Validation Architecture Analysis

## Key Discovery

Our validator was **not using the same validation logic as n8n**. This document outlines how n8n actually validates workflows and what we need to do to match it.

## n8n's Validation Flow

### 1. Core Validation Function
**Location**: `packages/workflow/src/node-helpers.ts`

The main function is `getNodeParameters()` which:
- Takes node type definition (`INodeTypeDescription.properties`)
- Takes actual node parameter values
- Validates parameters against the schema
- Throws `"Could not find property option"` when a `fixedCollection` contains unknown keys

### 2. Node Type Definitions
**Location**: `packages/nodes-base/nodes/*/`

Each node defines its schema via `INodeTypeDescription.properties`. Example for If v2:

```typescript
properties: [
  {
    name: 'conditions',
    type: 'filter',        // Special type with FilterValue schema
    default: {},
    typeOptions: { ... }
  },
  {
    name: 'options',
    type: 'collection',    // Collection type with sub-options
    options: [
      { name: 'ignoreCase', type: 'boolean', ... }
    ]
  }
]
```

### 3. Filter Type Schema
**Location**: `packages/workflow/src/interfaces.ts`

```typescript
type FilterValue = {
  options: FilterOptionsValue;    // Required
  conditions: FilterConditionValue[];
  combinator: 'and' | 'or';
}

type FilterOptionsValue = {
  caseSensitive: boolean;
  leftValue: string;
  typeValidation: 'strict' | 'loose';
  version: 1 | 2;
}
```

### 4. Import/Paste Flow
**Location**: `packages/frontend/editor-ui/src/app/composables/useCanvasOperations.ts`

1. `importWorkflowData()` receives workflow JSON
2. Calls `addImportedNodesToWorkflow()`
3. Loads node type definitions via `nodeHelpers.loadNodesProperties()`
4. Calls `NodeHelpers.getNodeParameters()` to validate each node
5. If validation fails, throws error shown to user

## The "Could not find property option" Error

**Source**: `node-helpers.ts` line ~850

```typescript
// In fixedCollection handling:
nodePropertyOptions = nodeProperties.options!.find(
  (nodePropertyOptions) => nodePropertyOptions.name === itemName,
);

if (nodePropertyOptions === undefined) {
  throw new ApplicationError('Could not find property option', {
    extra: { propertyOption: itemName, property: nodeProperties.name },
  });
}
```

This happens when:
1. A node parameter is type `fixedCollection`
2. The workflow JSON contains a key that doesn't exist in the node's `options` array
3. n8n can't find a matching option definition

## What Our Validator Was Missing

1. **No node type definitions** - We didn't have access to actual n8n node schemas
2. **Custom validation logic** - We wrote our own rules instead of using n8n's
3. **Incomplete filter type handling** - We didn't validate `FilterValue` structure properly

## Correct If Node v2 Structure

From n8n test file `IfV2.string.json`:

```json
{
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": false,
        "leftValue": ""
      },
      "conditions": [
        {
          "leftValue": "={{ $json.field }}",
          "rightValue": "value",
          "operator": {
            "type": "string",
            "operation": "equals"
          }
        }
      ],
      "combinator": "and"
    },
    "options": {
      "caseSensitive": false
    }
  },
  "type": "n8n-nodes-base.if",
  "typeVersion": 2
}
```

## LLM Hallucination Pattern

LLMs often generate:
```json
"conditions": {
  "combinator": "and",
  "conditions": [...],
  "options": {
    "version": 2,              // INVALID - not in FilterOptionsValue
    "caseSensitive": true,     // Valid
    "typeValidation": "strict" // Valid but often unnecessary
  }
}
```

The `version` key inside `conditions.options` may cause issues depending on n8n version.

## Recommended Architecture

### Option A: Use n8n's workflow package directly
```bash
npm install n8n-workflow
```
Then import and use `NodeHelpers.getNodeParameters()` with node type definitions.

### Option B: Extract and bundle node type definitions
1. Extract `INodeTypeDescription` from all nodes in `nodes-base`
2. Bundle as JSON schema files
3. Validate against these schemas

### Option C: Call n8n API for validation
If connected to an n8n instance, use the API to validate workflows.

## Files to Study

- `n8n-source/packages/workflow/src/node-helpers.ts` - Core validation
- `n8n-source/packages/workflow/src/interfaces.ts` - Type definitions
- `n8n-source/packages/workflow/src/node-parameters/filter-parameter.ts` - Filter validation
- `n8n-source/packages/nodes-base/nodes/If/V2/IfV2.node.ts` - If node definition
- `n8n-source/packages/frontend/editor-ui/src/app/composables/useCanvasOperations.ts` - Import flow
