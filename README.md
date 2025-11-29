<h1 align="center">🔍 n8n-workflow-validator 🔍</h1>
<h3 align="center">Stop praying your workflow JSON is valid. Start getting real answers.</h3>

<p align="center">
  <strong>
    <em>The CLI + library that validates n8n workflows using n8n's actual engine. It tells you exactly what's wrong, shows the correct schema, and auto-fixes common mistakes.</em>
  </strong>
</p>

<p align="center">
  <!-- Package Info -->
  <a href="https://www.npmjs.com/package/n8n-workflow-validator"><img alt="npm" src="https://img.shields.io/npm/v/n8n-workflow-validator.svg?style=flat-square&color=4D87E6"></a>
  <a href="#"><img alt="node" src="https://img.shields.io/badge/node-18+-4D87E6.svg?style=flat-square"></a>
  <a href="#"><img alt="typescript" src="https://img.shields.io/badge/TypeScript-first-4D87E6.svg?style=flat-square"></a>
  &nbsp;&nbsp;•&nbsp;&nbsp;
  <!-- Features -->
  <a href="https://opensource.org/licenses/MIT"><img alt="license" src="https://img.shields.io/badge/License-MIT-F9A825.svg?style=flat-square"></a>
  <a href="#"><img alt="platform" src="https://img.shields.io/badge/platform-CLI_|_API_|_MCP-2ED573.svg?style=flat-square"></a>
</p>

<p align="center">
  <img alt="native n8n engine" src="https://img.shields.io/badge/⚡_native_n8n_engine-real_validation-2ED573.svg?style=for-the-badge">
  <img alt="llm friendly" src="https://img.shields.io/badge/🤖_llm_friendly-json_output_+_schema_hints-2ED573.svg?style=for-the-badge">
</p>

<div align="center">

### 🧭 Quick Navigation

[**⚡ Get Started**](#-get-started-in-10-seconds) •
[**✨ Key Features**](#-feature-breakdown-the-secret-sauce) •
[**🎮 CLI Usage**](#-cli-usage) •
[**📦 API Reference**](#-api-usage) •
[**🆚 Why This Exists**](#-why-this-exists)

</div>

---

**`n8n-workflow-validator`** is the validation layer your n8n tooling deserves. Building an MCP server? A workflow generator? An AI agent that creates automations? This tool uses **n8n's actual validation engine** (`n8n-workflow` + `n8n-nodes-base`) to give you the exact same errors you'd see in the n8n editor—plus schema hints that show exactly how to fix them.

<div align="center">
<table>
<tr>
<td align="center">
<h3>⚙️</h3>
<b>Native n8n Engine</b><br/>
<sub>Uses actual n8n-workflow</sub>
</td>
<td align="center">
<h3>🎯</h3>
<b>Schema Delta Detection</b><br/>
<sub>Shows missing/extra keys</sub>
</td>
<td align="center">
<h3>🔧</h3>
<b>Auto-Fix Mode</b><br/>
<sub>Repairs common issues</sub>
</td>
<td align="center">
<h3>🤖</h3>
<b>LLM-Friendly Output</b><br/>
<sub>JSON with schema hints</sub>
</td>
</tr>
</table>
</div>

How it slaps:
- **You:** LLM generates a workflow. Is it valid?
- **Old way:** Paste into n8n. Get `"Could not find property option"`. Cry.
- **Validator way:** `npx n8n-workflow-validator workflow.json`
- **Result:** Line numbers. Schema diff. Correct usage example. Fix and ship.

---

## 💥 Why This Exists

LLMs generate n8n workflows. Workflows have complex schemas. Validation errors are cryptic. This tool fixes all of that.

<table align="center">
<tr>
<td align="center"><b>❌ The Old Way (Pain)</b></td>
<td align="center"><b>✅ The Validator Way (Glory)</b></td>
</tr>
<tr>
<td>
<ol>
  <li>LLM generates workflow JSON.</li>
  <li>Paste into n8n editor.</li>
  <li>Get cryptic error: "Could not find property"</li>
  <li>Hunt through n8n docs for schema.</li>
  <li>Manually fix. Repeat 10 times.</li>
</ol>
</td>
<td>
<ol>
  <li>LLM generates workflow JSON.</li>
  <li><code>npx n8n-workflow-validator --json</code></li>
  <li>Get exact schema diff + correct example.</li>
  <li><code>--fix</code> auto-repairs common issues.</li>
  <li>Ship with confidence. ☕</li>
</ol>
</td>
</tr>
</table>

We use **actual n8n packages** (`n8n-workflow`, `n8n-nodes-base`) to validate. Same engine as the n8n editor. Zero guesswork.

---

## 🚀 Get Started in 10 Seconds

```bash
# Validate any workflow JSON
npx n8n-workflow-validator workflow.json

# Auto-fix and save
npx n8n-workflow-validator workflow.json --fix --out fixed.json

# JSON output for LLMs/automation
npx n8n-workflow-validator workflow.json --json
```

No config. No setup. Just works.

---

## ✨ Feature Breakdown: The Secret Sauce

<div align="center">

| Feature | What It Does | Why You Care |
| :---: | :--- | :--- |
| **⚙️ Native Engine**<br/>`n8n-workflow + n8n-nodes-base` | Uses `NodeHelpers.getNodeParameters` from n8n | Same validation as n8n editor—identical errors |
| **🎯 Schema Delta**<br/>`Missing/extra key detection` | Shows exactly which keys are wrong vs schema | Fix the right thing the first time |
| **📍 Source Locations**<br/>`Line & column numbers` | Points to exact JSON location with code snippet | No hunting through 1000-line files |
| **💡 Correct Usage**<br/>`Schema-derived examples` | Shows the correct parameter structure | Copy-paste the fix, done |
| **🔧 Auto-Fix**<br/>`--fix flag` | Repairs Switch v3 conditions, fallbackOutput, etc. | Let the tool do the boring work |
| **🤖 JSON Output**<br/>`--json flag` | Structured output with all schema hints | Perfect for LLMs and CI pipelines |

</div>

---

## 🎮 CLI Usage

### Basic Validation

```bash
npx n8n-workflow-validator workflow.json
```

### Rich Error Output

```
❌ INVALID: workflow.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛑 ERRORS (1)

────────────────────────────────────────────────────────────────────────────────
[1] N8N_PARAMETER_VALIDATION_ERROR
    Path: nodes[12]
    Location: Line 305, Column 5
    Node: "route-by-format" (n8n-nodes-base.switch)

    Message: Could not find property option

    Source:
    ┌──────┬────────────────────────────────────────────────────────────
    │ 302 │          "typeVersion": 2,
    │ 303 │          "onError": "continueErrorOutput"
    │ 304 │        },
    │ 305 │>>>     {
    │ 306 │          "parameters": {
    └──────┴────────────────────────────────────────────────────────────

    Root Cause Analysis:
      • n8n Runtime Error: "Could not find property option"

    Schema Delta:
      • Missing keys: options
      • Extra keys: fallbackOutput

    Correct Usage:
    ┌──────────────────────────────────────────────────────────────────
    │ {
    │   "conditions": {
    │     "options": {
    │       "caseSensitive": true,
    │       "leftValue": "",
    │       "typeValidation": "strict"
    │     },
    │     "conditions": [...],
    │     "combinator": "and"
    │   }
    │ }
    └──────────────────────────────────────────────────────────────────
```

---

### JSON Output for LLMs & Automation

```bash
npx n8n-workflow-validator workflow.json --json
```

Returns structured data with schema hints for programmatic consumption:

```json
{
  "valid": false,
  "issues": [{
    "code": "N8N_PARAMETER_VALIDATION_ERROR",
    "severity": "error",
    "message": "Could not find property option",
    "location": {
      "nodeName": "route-by-format",
      "nodeType": "n8n-nodes-base.switch",
      "path": "nodes[12]"
    },
    "sourceLocation": { "line": 305, "column": 5 },
    "context": {
      "n8nError": "Could not find property option",
      "fullObject": { "mode": "rules", "rules": {} },
      "expectedSchema": { "mode": "rules", "rules": {}, "options": {} },
      "schemaPath": "parameters"
    }
  }]
}
```

Perfect for feeding back into an LLM to auto-correct workflows.

---

### CLI Options

<div align="center">

| Option | Description |
|:------:|:------------|
| `--fix` | Auto-fix known issues (Switch v3, fallbackOutput, etc.) |
| `--json` | JSON output for programmatic use |
| `--out FILE` | Write fixed workflow to FILE |
| `--repair` | Repair malformed JSON before validation |
| `--no-sanitize` | Skip sanitization step |
| `-h, --help` | Show help |

</div>

---

### Exit Codes

| Code | Meaning |
|:----:|:--------|
| `0` | ✅ Valid workflow |
| `1` | ❌ Invalid workflow |

---

## 📦 API Usage

Use as a library in your own tools:

```typescript
import { 
  validateWorkflowStructure, 
  validateNodeWithN8n,
  nodeRegistry,
  jsonParse 
} from 'n8n-workflow-validator';

const raw = fs.readFileSync('workflow.json', 'utf8');
const workflow = jsonParse(raw);
const result = validateWorkflowStructure(workflow, { rawSource: raw });

for (const issue of result.issues) {
  console.log(`[${issue.code}] ${issue.message}`);
  
  // Schema hints for LLMs
  if (issue.context?.expectedSchema) {
    console.log('Expected:', JSON.stringify(issue.context.expectedSchema, null, 2));
  }
  
  // Delta detection
  if (issue.context?.schemaDelta) {
    console.log('Missing:', issue.context.schemaDelta.missingKeys);
    console.log('Extra:', issue.context.schemaDelta.extraKeys);
  }
}
```

---

## 🎯 What Gets Validated

<div align="center">

| Layer | What's Checked | Source |
|:-----:|:---------------|:-------|
| **Structure** | `nodes` array, `connections` object, required fields | JSON schema |
| **Parameters** | All node parameters against schema | `NodeHelpers.getNodeParameters` |
| **Connections** | Valid node references, input/output types | n8n connection rules |
| **Node Types** | Known types from `n8n-nodes-base` | Node registry |
| **Auto-Fix Targets** | Switch v3 conditions, fallbackOutput location | Common LLM mistakes |

</div>

---

## 🔧 Installation Options

```bash
# Use directly with npx (no install needed)
npx n8n-workflow-validator workflow.json

# Or install globally
npm install -g n8n-workflow-validator
n8n-validate workflow.json

# Or add to your project
npm install n8n-workflow-validator
```

---

## 🎯 Use Cases

<div align="center">

| Scenario | How This Helps |
|:---------|:---------------|
| **🤖 MCP Servers** | Validate before sending to n8n API |
| **🧠 LLM Agents** | Get schema hints to fix generated workflows |
| **🔧 Workflow Generators** | Ensure output is valid before export |
| **🧪 CI/CD Pipelines** | Block invalid workflows in PRs |
| **📥 Import Tools** | Pre-validate user uploads |
| **🔄 Migration Tools** | Validate during version upgrades |

</div>

---

## 🔥 Common Issues & Quick Fixes

<details>
<summary><b>Expand for troubleshooting tips</b></summary>

| Problem | Solution |
| :--- | :--- |
| **"Could not find property"** | Check Schema Delta in output—shows missing/extra keys |
| **Switch node errors** | Use `--fix` flag—auto-fixes Switch v3 condition structure |
| **Malformed JSON** | Use `--repair` flag to fix common JSON syntax errors |
| **Too many errors** | Fix structure errors first (missing nodes/connections) |
| **Node type not found** | Ensure node type exists in current `n8n-nodes-base` version |

</details>

---

## 🛠️ Development

```bash
# Clone
git clone https://github.com/yigitkonur/n8n-workflow-validator.git
cd n8n-workflow-validator

# Install
npm install

# Build
npm run build

# Test
npm test
```

---

<div align="center">

**Built with 🔥 because "Could not find property option" is not helpful.**

MIT © [Yiğit Konur](https://github.com/yigitkonur)

</div>
