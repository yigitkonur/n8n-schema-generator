extracts JSON schemas from every n8n node and credential by loading the actual `n8n-nodes-base` package at runtime, reflecting over class instances, and writing structured JSON files. also ships a zero-dependency validation API so LLMs (or anything else) can check generated workflows before deploying them.

schemas auto-update hourly via GitHub Actions when a new n8n version drops. 428 nodes, 389 credentials, all committed to `schemas/`.

```bash
npm run extract   # generate all schemas
npm run serve     # start validation API on :3000
```

[![node](https://img.shields.io/badge/node-18+-93450a.svg?style=flat-square)](https://nodejs.org/)
[![typescript](https://img.shields.io/badge/typescript-5.3+-93450a.svg?style=flat-square)](https://www.typescriptlang.org/)
[![license](https://img.shields.io/badge/license-MIT-grey.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## what it does

two parts:

**schema extractor** (`extract.ts`) — loads `n8n-nodes-base` compiled JS, instantiates every node and credential class, extracts properties/defaults/validation rules, writes them as individual JSON files. uses MD5 hashing to skip unchanged files between runs.

**validation API** (`server.ts`) — loads extracted schemas into memory, exposes REST endpoints to browse, search, and validate node configs and full workflows. built on raw `node:http`, no framework.

### extractor details

- discovers nodes by walking `dist/nodes/*.node.js` from the installed package
- handles versioned nodes (`VersionedNodeType`) — extracts all version variants
- computes defaults using `NodeHelpers.getNodeParameters()` (same logic n8n uses internally)
- extracts enum values, required fields, filter schemas, fixed collections
- silent error handling — nodes that throw during instantiation are skipped, not fatal

### validation details

- validates node `type`, `typeVersion`, `position`, `parameters`
- merges conditional display options before checking enum values (handles n8n's pattern of same field name appearing multiple times with different allowed values)
- validates workflow structure: nodes array, connections object, duplicate name detection, connection reference integrity
- validates filter conditions and fixed collection keys against schema

---

## API endpoints

| method | path | description |
|:---|:---|:---|
| GET | `/` | API info, node count, n8n version |
| GET | `/nodes` | all nodes, filterable by `?category=` |
| GET | `/nodes/:name` | full schema for one node |
| GET | `/nodes/:name/defaults` | computed defaults only |
| GET | `/nodes/:name/validation` | validation rules only |
| GET | `/search?q=` | full-text search across name, display name, description (max 50) |
| POST | `/validate/node` | validate a single node config |
| POST | `/validate/workflow` | validate a full workflow |
| GET | `/workflow` | JSON Schema draft-07 for the workflow format |
| GET | `/types` | common type definitions (FilterValue, Expression, ParameterTypes) |

---

## install

```bash
git clone https://github.com/yigitkonur/n8n-schema-generator.git
cd n8n-schema-generator
npm install
```

## usage

### extract schemas

```bash
npm run extract              # compile + extract to schemas/
npm run extract:force        # overwrite all, ignore cache
node dist/extract.js mydir   # custom output directory
```

### start validation server

```bash
npm run serve                # compile + start on :3000
PORT=8080 npm start          # use pre-built dist, custom port
```

### validate a workflow

```bash
curl -X POST http://localhost:3000/validate/workflow \
  -H "Content-Type: application/json" \
  -d @my-workflow.json
```

### validate a single node

```bash
curl -X POST http://localhost:3000/validate/node \
  -H "Content-Type: application/json" \
  -d '{"type":"n8n-nodes-base.httpRequest","typeVersion":4.2,"position":[0,0],"parameters":{"method":"GET","url":"https://example.com"}}'
```

---

## configuration

| variable | default | description |
|:---|:---|:---|
| `PORT` | `3000` | API server port |
| `FORCE_UPDATE` | — | set to `1` to skip MD5 cache and rewrite all files |
| `CI` | — | set to `true` to emit change summary for GitHub Actions |

---

## auto-update

the included GitHub Actions workflow (`.github/workflows/update-schemas.yml`) runs hourly:

1. compares installed `n8n-workflow` version against latest on npm
2. if different, runs `npm update` + `npm run extract`
3. commits changed schema files back to the repo

schemas in `schemas/` are always committed — consumers can read them directly from GitHub without running the extractor.

---

## schema output

```
schemas/
  _meta.json                 — extraction timestamp, n8n version, node count
  common/
    types.json               — FilterValue, Expression, ParameterTypes
  workflow/
    workflow.json            — JSON Schema draft-07 for n8n workflow format
  credentials/
    _index.json              — all 389 credential names
    <name>.json              — per-credential properties
  nodes/
    _index.json              — all 428 nodes, categories, grouped index
    <name>.json              — full schema per node
    by-category/
      input.json             — nodes grouped by category
      output.json
      transform.json
      trigger.json
      schedule.json
      organization.json
    validation/
      _index.json            — validation index
      <name>.json            — flattened validation rules per node
```

## project structure

```
extract.ts                   — schema extractor CLI
server.ts                    — validation API server
package.json                 — deps, scripts, engines
tsconfig.json                — ES2022, NodeNext modules, dist/ output
.github/workflows/
  update-schemas.yml         — hourly auto-update cron
schemas/                     — generated output (committed)
```

## license

MIT
