# Switch v3+ Rule Conditions Missing 'options' Object

## Error Pattern
```
N8N_PARAMETER_VALIDATION_ERROR
Message: Could not find property option
Node Type: n8n-nodes-base.switch (typeVersion >= 3)
```

## Root Cause

Switch v3+ nodes use a `filter` type parameter for rule conditions. The filter type requires an `options` object containing:
- `caseSensitive: boolean`
- `leftValue: string`
- `typeValidation: "strict" | "loose"`
- `version: number` (required for v3.2+, should be `2`)

LLM-generated workflows often omit this `options` object, causing the "Could not find property option" error during import.

## Invalid Structure (LLM-generated)
```json
{
  "conditions": {
    "conditions": [...],
    "combinator": "and"
  }
}
```

## Valid Structure (n8n schema)
```json
{
  "conditions": {
    "options": {
      "caseSensitive": true,
      "leftValue": "",
      "typeValidation": "strict",
      "version": 2
    },
    "conditions": [...],
    "combinator": "and"
  }
}
```

## Additional Issue: fallbackOutput Location

For Switch v3+, `fallbackOutput` should be at `parameters.options.fallbackOutput`, not at `parameters.rules.fallbackOutput`.

### Invalid
```json
{
  "parameters": {
    "rules": {
      "values": [...],
      "fallbackOutput": "extra"  // WRONG
    }
  }
}
```

### Valid
```json
{
  "parameters": {
    "rules": {
      "values": [...]
    },
    "options": {
      "fallbackOutput": "extra"  // CORRECT
    }
  }
}
```

## Auto-Fix

Two fixers are implemented in `src/core/fixer.ts`:

1. **`fixSwitchV3RuleConditionsOptions`** - Adds missing `options` to rule conditions
2. **`fixSwitchV3FallbackOutputLocation`** - Moves `fallbackOutput` from rules to options

Run with `--fix` flag:
```bash
n8n-validate workflow.json --fix
```

## Schema Reference

See `n8n-source/packages/nodes-base/nodes/Switch/V3/SwitchV3.node.ts` lines 136-158 for the default schema.
