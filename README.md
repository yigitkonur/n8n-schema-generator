# n8n Workflow Validator

[![npm version](https://img.shields.io/npm/v/n8n-workflow-validator.svg)](https://www.npmjs.com/package/n8n-workflow-validator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Standalone CLI tool that validates n8n workflow JSON files with **rich error diagnostics** including source locations, code snippets, and root cause analysis. Perfect for LLM-powered self-healing agents that builds n8n workflows. As n8n does not have official validation utils, I have extracted the exactly same logic from n8n's source code that used for validation by source code of canvas editor.

## Quick Start

```bash
npx n8n-workflow-validator workflow.json
npx n8n-workflow-validator workflow.json --fix --out fixed.json
npx n8n-workflow-validator workflow.json --json  # For programmatic use
```

## Rich Error Output

The validator provides detailed, self-contained error reports:

```
❌ INVALID: workflow.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛑 ERRORS (1)

────────────────────────────────────────────────────────────────────────────────
[1] INVALID_IF_SWITCH_OPTIONS_ROOT
    Path: nodes[4].parameters.options
    Location: Line 129, Column 20
    Node: "check-document-exists" (n8n-nodes-base.if)

    Message: Found unexpected "options" key at parameters root level.

    Source:
    ┌──────┬────────────────────────────────────────────────────────────
    │ 126 │            "typeValidation": "strict"
    │ 127 │          }
    │ 128 │        },
    │ 129 │>>>     "options": {}
    │ 130 │      },
    │ 131 │      "id": "f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c",
    │ 132 │      "name": "check-document-exists",
    └──────┴────────────────────────────────────────────────────────────

    Root Cause Analysis:
      • n8n Runtime Error: "Could not find property option"
      • Expected: This node type does not define "options" as a root-level parameter.
      • Found: {}

    Full Context (the problematic object):
    ```json
    {
      "conditions": { "options": {...} },
      "options": {}
    }
    ```

    Valid Alternatives: [conditions, looseTypeValidation]

    Note: Observed parameter keys: [conditions, options]. Known valid keys for
    n8n-nodes-base.if: [conditions, looseTypeValidation].
```

## JSON Output for LLMs & Automation

```bash
npx n8n-workflow-validator workflow.json --json
```

Returns structured data with all diagnostic information:

```json
{
  "valid": false,
  "issues": [{
    "code": "INVALID_IF_SWITCH_OPTIONS_ROOT",
    "severity": "error",
    "message": "Found unexpected \"options\" key at parameters root level.",
    "location": {
      "nodeName": "check-document-exists",
      "nodeType": "n8n-nodes-base.if",
      "path": "nodes[4].parameters.options"
    },
    "sourceLocation": { "line": 129, "column": 20 },
    "sourceSnippet": {
      "lines": [
        { "lineNumber": 129, "content": "        \"options\": {}", "isHighlighted": true }
      ]
    },
    "context": {
      "value": {},
      "n8nError": "Could not find property option",
      "fullObject": { "conditions": {...}, "options": {} }
    },
    "validAlternatives": ["conditions", "looseTypeValidation"]
  }]
}
```

## Installation

```bash
# Use directly with npx (no install)
npx n8n-workflow-validator workflow.json

# Or install globally
npm install -g n8n-workflow-validator
n8n-validate workflow.json
```

## Options

| Option | Description |
|--------|-------------|
| `--fix` | Auto-fix known issues |
| `--json` | JSON output for programmatic use |
| `--out FILE` | Write fixed workflow to FILE |
| `--repair` | Repair malformed JSON |
| `--no-sanitize` | Skip sanitization |
| `-h, --help` | Show help |

## What It Validates

- **Structure**: `nodes` array, `connections` object
- **Node fields**: `type`, `typeVersion`, `position`, `parameters`
- **Known issues**: Invalid `options` in IF/Switch nodes

## Exit Codes

- `0` = Valid
- `1` = Invalid

## API Usage

```typescript
import { validateWorkflowStructure, jsonParse } from 'n8n-workflow-validator';

const raw = fs.readFileSync('workflow.json', 'utf8');
const workflow = jsonParse(raw);
const result = validateWorkflowStructure(workflow, { rawSource: raw });

for (const issue of result.issues) {
  console.log(`[${issue.code}] ${issue.message}`);
  console.log(`  Line ${issue.sourceLocation?.line}`);
  console.log(`  ${issue.context?.n8nError}`);
}
```

## License

MIT
