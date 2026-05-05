import type { HydratedDocument } from 'mongoose';
import type { SourceDocument } from '../../../infra/mongo/models/Source.js';

export interface ConnectorDocument {
  externalId: string;
  title: string;
  url?: string;
  content: string;
  mimeType?: string;
  visibility?: 'customer-facing' | 'internal' | 'draft';
  metadata?: Record<string, unknown>;
}

export interface Connector {
  readonly type: string;
  sync(source: HydratedDocument<SourceDocument>): AsyncIterable<ConnectorDocument>;
  webhook?(
    source: HydratedDocument<SourceDocument>,
    payload: unknown,
  ): AsyncIterable<ConnectorDocument>;
}

const registry = new Map<string, Connector>();

export function registerConnector(connector: Connector): void {
  if (registry.has(connector.type)) {
    throw new Error(`Connector already registered: ${connector.type}`);
  }
  registry.set(connector.type, connector);
}

export function getConnector(type: string): Connector {
  const connector = registry.get(type);
  if (!connector) {
    throw new Error(`No connector registered for type: ${type}`);
  }
  return connector;
}

export function listConnectorTypes(): string[] {
  return Array.from(registry.keys());
}

export function _resetRegistry(): void {
  registry.clear();
}
