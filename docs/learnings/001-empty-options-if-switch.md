# Learning 001: Empty `options` at parameters root on If/Switch nodes

## Error code
`INVALID_IF_SWITCH_OPTIONS_ROOT`

## Pattern
When an LLM (or human) generates an n8n workflow, it sometimes adds an empty `"options": {}` key at the **root level** of `parameters` for `n8n-nodes-base.if` and `n8n-nodes-base.switch` nodes.

Example (invalid):
```json
{
  "parameters": {
    "conditions": { ... },
    "options": {}          // <-- INVALID at root level
  },
  "type": "n8n-nodes-base.if",
  ...
}
```

## Why it's invalid
- The n8n parameter schema for `if` and `switch` nodes does **not** define `options` as a valid root-level parameter.
- n8n runtime throws: `"Could not find property option"`.
- Valid root-level keys for `if`: `conditions`, `looseTypeValidation`.
- Valid root-level keys for `switch`: `rules`, `fallbackOutput`.

Note: There **is** a valid `options` key **inside** `conditions` (e.g., `conditions.options.version`), but that's nested, not at the root.

## Fix
Delete the `"options": {}` key from the root of `parameters` when:
1. Node type is `n8n-nodes-base.if` or `n8n-nodes-base.switch`.
2. `parameters.options` exists.
3. `parameters.options` is an empty object (`{}`).

## Automated fixer
This pattern is already covered by the experimental fixer rule:
- **Rule ID**: `empty-options-if-switch`
- **File**: `src/core/experimental-fixer.ts`
- **Function**: `fixEmptyOptionsOnConditionalNodes.apply(workflow)`

The fixer safely removes the empty `options` key and logs a warning per fixed node.

## Example workflow fixed
- **File**: `04-document-upload-process-trigger.json`
- **Nodes fixed**: 4
  - `check-document-exists` (if)
  - `check-status-pending` (if)
  - `route-by-format` (switch)
  - `check-processing-success` (if)

## Confidence
**High** — This is a well-understood, safe, and idempotent fix. The empty `options` object has no semantic meaning at the root level for these node types.
