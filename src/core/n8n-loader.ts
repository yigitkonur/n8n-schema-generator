import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import type { INodeType, INodeTypeDescription, VersionedNodeType } from 'n8n-workflow';

const require = createRequire(import.meta.url);
// Load n8n-workflow via CommonJS entrypoint to avoid ESM logger-proxy resolution issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const n8nWorkflowCjs = require('n8n-workflow') as any;
// Use a differently named runtime class to avoid clashing with the type-only VersionedNodeType
const { VersionedNodeType: CjsVersionedNodeType } = n8nWorkflowCjs;

export class NodeRegistry {
  private nodeTypes: Map<string, any> = new Map();
  private initialized = false;

  init() {
    if (this.initialized) return;

    let nodesBaseRoot: string;
    try {
      nodesBaseRoot = path.join(
        path.dirname(require.resolve('n8n-nodes-base/package.json')),
        'dist',
        'nodes',
      );
    } catch {
      throw new Error('Could not locate n8n-nodes-base. Please ensure it is installed.');
    }

    this.scanDirectory(nodesBaseRoot);
    this.initialized = true;
  }

  private scanDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.node.js')) {
        this.loadNodeFile(fullPath);
      }
    }
  }

  private loadNodeFile(filePath: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const module = require(filePath);
      
      // Iterate exports to find INodeType classes
      for (const key in module) {
        const ExportedClass = module[key];
        // Check if it looks like a class
        if (typeof ExportedClass === 'function' && ExportedClass.prototype) {
          try {
            const instance = new ExportedClass();
            if (instance.description) {
              const name = instance.description.name;
              // Register with and without prefix to be safe
              this.nodeTypes.set(name, instance);
              this.nodeTypes.set(`n8n-nodes-base.${name}`, instance);
            }
          } catch (e) {
            // Ignore instantiation errors (some helpers might export classes that assume env)
          }
        }
      }
    } catch (e) {
      // Ignore require errors
    }
  }

  getNodeType(nodeType: string, version?: number): INodeTypeDescription | null {
    const nodeInstance = this.nodeTypes.get(nodeType) as INodeType | VersionedNodeType | undefined;
    if (!nodeInstance) return null;

    if (nodeInstance instanceof CjsVersionedNodeType) {
      const vt = nodeInstance as VersionedNodeType;
      const resolvedVersion =
        version ?? (vt.description as any).defaultVersion ?? vt.getLatestVersion();
      const concrete = vt.getNodeType(resolvedVersion);
      return concrete.description;
    }

    return (nodeInstance as INodeType).description;
  }
}

export const nodeRegistry = new NodeRegistry();
