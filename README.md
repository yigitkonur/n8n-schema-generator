<h1 align="center">🔧 n8n-schema-generator</h1>
<h3 align="center">Complete JSON schemas for every n8n node, auto-updated hourly</h3>

<p align="center">
  <strong>Built for MCP servers, AI agents, and anyone building tools that generate n8n workflows.</strong>
</p>

<p align="center">
  <a href="#"><img alt="Auto-updates" src="https://img.shields.io/badge/updates-hourly-2ED573.svg?style=flat-square"></a>
  <a href="#"><img alt="n8n" src="https://img.shields.io/badge/n8n-v1.119+-FF6D5A.svg?style=flat-square"></a>
  <a href="#"><img alt="Nodes" src="https://img.shields.io/badge/nodes-436+-4D87E6.svg?style=flat-square"></a>
  <a href="#"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square"></a>
</p>

---

## Why I Built This

Building MCP servers and AI agents that create n8n workflows? **n8n doesn't publish standalone schemas.**

This repo extracts schemas directly from `n8n-nodes-base` and keeps them updated automatically.

---

## Quick Start

### Fetch directly
```javascript
const schema = await fetch(
  'https://raw.githubusercontent.com/yigitkonur/n8n-schema-generator/main/schemas/nodes/httpRequest.json'
).then(r => r.json());
```

### Clone locally
```bash
git clone https://github.com/yigitkonur/n8n-schema-generator.git
```

---

## For MCP/AI Developers

```typescript
import httpSchema from './schemas/nodes/httpRequest.json';

// Get valid options
const methods = httpSchema.properties
  .find(p => p.name === 'method')?.options?.map(o => o.value);
// → ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']

// Get defaults
httpSchema.defaults;
// → { method: 'GET', url: '', authentication: 'none', ... }
```

---

## Schema Structure

```
schemas/
├── nodes/              # 436 node schemas
│   ├── httpRequest.json
│   ├── if.json
│   ├── by-category/    # Grouped indexes
│   └── validation/     # Rules & constraints
├── workflow/           # Workflow JSON schema
├── common/             # FilterValue, Expression types
└── credentials/        # 389 credential schemas
```

---

## Auto-Updates

GitHub Actions runs hourly, updates dependencies, regenerates schemas (only changed files via MD5), and commits automatically.

---

<div align="center">
<strong>Built for the n8n ecosystem</strong> 🚀
</div>