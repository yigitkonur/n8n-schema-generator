#!/usr/bin/env node
/**
 * n8n Schema Extractor
 * 
 * Extracts JSON schemas from n8n-nodes-base with smart caching.
 * Only updates files that have actually changed (MD5 comparison).
 * 
 * Usage: npx ts-node extract.ts [output-dir]
 * 
 * Environment:
 *   FORCE_UPDATE=1  - Force update all files regardless of cache
 *   CI=true         - Running in CI mode (outputs summary for commits)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const n8nWorkflow = require('n8n-workflow') as any;
const { NodeHelpers, VersionedNodeType } = n8nWorkflow;

const FORCE = process.env.FORCE_UPDATE === '1';
const CI = process.env.CI === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function md5(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

function writeIfChanged(filePath: string, content: string, stats: ChangeStats): boolean {
  const newHash = md5(content);
  
  if (!FORCE && fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (md5(existing) === newHash) {
      stats.unchanged++;
      return false;
    }
    stats.updated++;
  } else {
    stats.created++;
  }
  
  fs.writeFileSync(filePath, content);
  stats.changedFiles.push(filePath);
  return true;
}

interface ChangeStats {
  created: number;
  updated: number;
  unchanged: number;
  changedFiles: string[];
}

function newStats(): ChangeStats {
  return { created: 0, updated: 0, unchanged: 0, changedFiles: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Node Loader
// ─────────────────────────────────────────────────────────────────────────────

function loadNodes(): Map<string, any> {
  const nodes = new Map<string, any>();
  const root = path.join(
    path.dirname(require.resolve('n8n-nodes-base/package.json')),
    'dist', 'nodes'
  );

  function scan(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (entry.name.endsWith('.node.js')) {
        try {
          const mod = require(full);
          for (const key in mod) {
            const Cls = mod[key];
            if (typeof Cls === 'function' && Cls.prototype) {
              try {
                const inst = new Cls();
                if (inst.description?.name) nodes.set(inst.description.name, inst);
              } catch {}
            }
          }
        } catch {}
      }
    }
  }

  scan(root);
  return nodes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Extractor
// ─────────────────────────────────────────────────────────────────────────────

class Extractor {
  private nodes: Map<string, any>;
  private out: string;
  private stats = newStats();

  constructor(outDir: string) {
    this.out = outDir;
    this.nodes = loadNodes();
  }

  run(): ChangeStats {
    console.log(`📦 Loaded ${this.nodes.size} node types`);
    
    this.mkdirs();
    this.extractNodes();
    this.extractWorkflow();
    this.extractCommon();
    this.extractCredentials();
    this.extractMeta();

    return this.stats;
  }

  private mkdirs() {
    const dirs = ['', '/nodes', '/nodes/by-category', '/nodes/validation', '/workflow', '/common', '/credentials'];
    for (const d of dirs) {
      const p = this.out + d;
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Nodes
  // ─────────────────────────────────────────────────────────────────────────

  private extractNodes() {
    const categories: Record<string, string[]> = {};
    const allNodes: string[] = [];
    const withFilters: string[] = [];
    const withFixedColl: string[] = [];

    for (const [name, node] of this.nodes) {
      if (!name || typeof name !== 'string') continue;
      
      try {
        const isVersioned = node instanceof VersionedNodeType;
        let desc: any, defVer: number | undefined, versions: number[] | undefined;

        if (isVersioned) {
          defVer = node.description?.defaultVersion ?? node.getLatestVersion();
          versions = this.getVersions(node);
          desc = node.getNodeType(defVer).description;
        } else {
          desc = node.description;
        }
        if (!desc) continue;

        // Compute defaults
        let defaults = {};
        try {
          defaults = NodeHelpers.getNodeParameters(desc.properties || [], {}, true, true, { typeVersion: defVer ?? 1 }, desc) || {};
        } catch {}

        // Node schema
        const schema = {
          name: desc.name,
          displayName: desc.displayName,
          description: desc.description || '',
          group: desc.group || [],
          version: desc.version,
          defaults,
          inputs: desc.inputs || ['main'],
          outputs: desc.outputs || ['main'],
          properties: (desc.properties || []).map((p: any) => ({
            name: p.name, displayName: p.displayName, type: p.type, default: p.default,
            required: p.required, description: p.description,
            ...(p.options && { options: p.options }),
            ...(p.typeOptions && { typeOptions: p.typeOptions }),
            ...(p.displayOptions && { displayOptions: p.displayOptions }),
          })),
          credentials: desc.credentials || [],
          hasVersions: isVersioned,
          ...(versions && { availableVersions: versions }),
          ...(defVer && { defaultVersion: defVer }),
        };

        writeIfChanged(`${this.out}/nodes/${name}.json`, JSON.stringify(schema, null, 2), this.stats);

        // Validation schema
        const props = desc.properties || [];
        const rules = props.filter((p: any) => p.name).map((p: any) => ({
          field: p.name,
          type: p.type || 'string',
          required: p.required === true || (p.default === undefined && !p.displayOptions),
          default: p.default,
          ...(p.options?.length && (p.type === 'options' || p.type === 'multiOptions') && { enumValues: p.options.map((o: any) => o.value) }),
          ...(p.displayOptions && { displayOptions: p.displayOptions }),
        }));

        const hasFilter = props.some((p: any) => p.type === 'filter');
        const fixedColls = props.filter((p: any) => p.type === 'fixedCollection').map((p: any) => p.name);

        const validation = {
          nodeType: `n8n-nodes-base.${name}`,
          displayName: desc.displayName,
          version: desc.version,
          ...(defVer && { defaultVersion: defVer }),
          rules,
          computedDefaults: defaults,
          hasFilter,
          fixedCollections: fixedColls,
        };

        writeIfChanged(`${this.out}/nodes/validation/${name}.json`, JSON.stringify(validation, null, 2), this.stats);

        // Track categories
        allNodes.push(name);
        for (const cat of desc.group || ['other']) (categories[cat] ||= []).push(name);
        if (hasFilter) withFilters.push(name);
        if (fixedColls.length) withFixedColl.push(name);

      } catch {}
    }

    // Category indexes
    for (const [cat, nodes] of Object.entries(categories)) {
      writeIfChanged(
        `${this.out}/nodes/by-category/${cat.toLowerCase()}.json`,
        JSON.stringify({ category: cat, count: nodes.length, nodes: nodes.sort() }, null, 2),
        this.stats
      );
    }

    // Master indexes
    writeIfChanged(`${this.out}/nodes/_index.json`, JSON.stringify({
      totalNodes: allNodes.length,
      categories: Object.keys(categories).sort(),
      nodes: allNodes.sort(),
      byCategory: categories,
    }, null, 2), this.stats);

    writeIfChanged(`${this.out}/nodes/validation/_index.json`, JSON.stringify({
      total: allNodes.length,
      nodes: allNodes.sort(),
      withFilters: withFilters.sort(),
      withFixedCollections: withFixedColl.sort(),
    }, null, 2), this.stats);

    console.log(`  ✓ ${allNodes.length} nodes`);
  }

  private getVersions(node: any): number[] {
    try {
      if (node.nodeVersions) return Object.keys(node.nodeVersions).map(Number).sort((a, b) => a - b);
      const v = node.description?.version;
      return Array.isArray(v) ? v : [v];
    } catch { return []; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Workflow
  // ─────────────────────────────────────────────────────────────────────────

  private extractWorkflow() {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'n8n Workflow',
      type: 'object',
      required: ['nodes', 'connections'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        active: { type: 'boolean', default: false },
        nodes: { type: 'array', items: { $ref: '#/definitions/Node' } },
        connections: { type: 'object' },
        settings: { $ref: '#/definitions/Settings' },
        staticData: { type: 'object' },
        pinData: { type: 'object' },
        tags: { type: 'array' },
        meta: { type: 'object' },
      },
      definitions: {
        Node: {
          type: 'object',
          required: ['type', 'typeVersion', 'position', 'parameters'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string', pattern: '^[\\w@/-]+\\.[\\w]+$' },
            typeVersion: { type: 'number', minimum: 1 },
            position: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
            parameters: { type: 'object' },
            credentials: { type: 'object' },
            disabled: { type: 'boolean' },
            continueOnFail: { type: 'boolean' },
            onError: { type: 'string', enum: ['stopWorkflow', 'continueRegularOutput', 'continueErrorOutput'] },
          },
        },
        Settings: {
          type: 'object',
          properties: {
            saveManualExecutions: { type: 'boolean' },
            saveDataErrorExecution: { type: 'string', enum: ['all', 'none'] },
            saveDataSuccessExecution: { type: 'string', enum: ['all', 'none'] },
            executionTimeout: { type: 'number' },
            timezone: { type: 'string' },
            executionOrder: { type: 'string', enum: ['v0', 'v1'] },
          },
        },
      },
    };

    writeIfChanged(`${this.out}/workflow/workflow.json`, JSON.stringify(schema, null, 2), this.stats);
    console.log(`  ✓ workflow schema`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Common Types
  // ─────────────────────────────────────────────────────────────────────────

  private extractCommon() {
    const types = {
      FilterValue: {
        type: 'object',
        required: ['options', 'conditions', 'combinator'],
        properties: {
          options: {
            type: 'object',
            properties: {
              caseSensitive: { type: 'boolean', default: true },
              leftValue: { type: 'string', default: '' },
              typeValidation: { type: 'string', enum: ['strict', 'loose'] },
            },
          },
          conditions: { type: 'array' },
          combinator: { type: 'string', enum: ['and', 'or'] },
        },
      },
      Expression: {
        pattern: '^={{.*}}$',
        variables: ['$json', '$node', '$input', '$now', '$env', '$execution', '$workflow', '$itemIndex'],
        examples: ['={{ $json.field }}', '={{ $node["Name"].json }}', '={{ $now.format("yyyy-MM-dd") }}'],
      },
      ParameterTypes: ['string', 'number', 'boolean', 'json', 'options', 'multiOptions', 'collection', 'fixedCollection', 'filter', 'resourceLocator'],
    };

    writeIfChanged(`${this.out}/common/types.json`, JSON.stringify(types, null, 2), this.stats);
    console.log(`  ✓ common types`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Credentials
  // ─────────────────────────────────────────────────────────────────────────

  private extractCredentials() {
    const dir = path.join(path.dirname(require.resolve('n8n-nodes-base/package.json')), 'dist', 'credentials');
    const creds: string[] = [];

    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.credentials.js')) continue;
        try {
          const mod = require(path.join(dir, file));
          for (const key in mod) {
            const Cls = mod[key];
            if (typeof Cls === 'function') {
              try {
                const inst = new Cls();
                if (inst.name) {
                  const schema = {
                    name: inst.name,
                    displayName: inst.displayName,
                    properties: inst.properties?.map((p: any) => ({
                      name: p.name, type: p.type, default: p.default, required: p.required,
                    })),
                  };
                  writeIfChanged(`${this.out}/credentials/${inst.name}.json`, JSON.stringify(schema, null, 2), this.stats);
                  creds.push(inst.name);
                }
              } catch {}
            }
          }
        } catch {}
      }
    }

    writeIfChanged(`${this.out}/credentials/_index.json`, JSON.stringify({
      total: creds.length,
      credentials: creds.sort(),
    }, null, 2), this.stats);

    console.log(`  ✓ ${creds.length} credentials`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Meta
  // ─────────────────────────────────────────────────────────────────────────

  private extractMeta() {
    let version = 'unknown';
    try {
      const pkg = JSON.parse(fs.readFileSync(require.resolve('n8n-workflow/package.json'), 'utf8'));
      version = pkg.version;
    } catch {}

    writeIfChanged(`${this.out}/_meta.json`, JSON.stringify({
      extractedAt: new Date().toISOString(),
      n8nVersion: version,
      nodeCount: this.nodes.size,
    }, null, 2), this.stats);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const outDir = process.argv[2] || 'schemas';

console.log('═══════════════════════════════════════════════════════════');
console.log('  n8n Schema Extractor');
console.log('═══════════════════════════════════════════════════════════');
if (FORCE) console.log('  Mode: FORCE UPDATE');

const stats = new Extractor(outDir).run();

console.log('');
console.log(`📊 Summary:`);
console.log(`   Created:   ${stats.created}`);
console.log(`   Updated:   ${stats.updated}`);
console.log(`   Unchanged: ${stats.unchanged}`);
console.log('═══════════════════════════════════════════════════════════');

// CI output for GitHub Actions
if (CI && stats.changedFiles.length > 0) {
  console.log('\n📝 Changed files:');
  stats.changedFiles.forEach(f => console.log(`   ${f}`));
  
  // Write summary for GH Actions
  const summary = `Updated ${stats.created + stats.updated} schema files (n8n v${JSON.parse(fs.readFileSync(require.resolve('n8n-workflow/package.json'), 'utf8')).version})`;
  fs.writeFileSync('.change-summary', summary);
}

process.exit(stats.changedFiles.length > 0 ? 0 : 0);
