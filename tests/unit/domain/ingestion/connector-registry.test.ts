import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetRegistry,
  getConnector,
  listConnectorTypes,
  registerConnector,
  type Connector,
  type ConnectorDocument,
} from '../../../../src/domain/ingestion/connectors/base.js';
import type { HydratedDocument } from 'mongoose';
import type { SourceDocument } from '../../../../src/infra/mongo/models/Source.js';

function makeConnector(type: string): Connector {
  return {
    type,
    async *sync(_source: HydratedDocument<SourceDocument>): AsyncIterable<ConnectorDocument> {
      yield { externalId: '1', title: 'Doc', content: 'hello' };
    },
  };
}

afterEach(() => {
  _resetRegistry();
});

describe('registerConnector', () => {
  it('registers and retrieves a connector', () => {
    const c = makeConnector('zendesk');
    registerConnector(c);
    expect(getConnector('zendesk')).toBe(c);
  });

  it('throws on duplicate type', () => {
    registerConnector(makeConnector('zendesk'));
    expect(() => registerConnector(makeConnector('zendesk'))).toThrow(
      'Connector already registered: zendesk',
    );
  });

  it('registers multiple types independently', () => {
    const z = makeConnector('zendesk');
    const n = makeConnector('notion');
    registerConnector(z);
    registerConnector(n);
    expect(getConnector('zendesk')).toBe(z);
    expect(getConnector('notion')).toBe(n);
  });
});

describe('getConnector', () => {
  it('throws for unknown type', () => {
    expect(() => getConnector('unknown')).toThrow(
      'No connector registered for type: unknown',
    );
  });
});

describe('listConnectorTypes', () => {
  it('returns empty when no connectors registered', () => {
    expect(listConnectorTypes()).toEqual([]);
  });

  it('lists all registered types', () => {
    registerConnector(makeConnector('zendesk'));
    registerConnector(makeConnector('notion'));
    expect(listConnectorTypes().sort()).toEqual(['notion', 'zendesk']);
  });
});

describe('Connector interface', () => {
  it('sync yields ConnectorDocuments', async () => {
    const docs: ConnectorDocument[] = [];
    const c = makeConnector('test');
    registerConnector(c);
    const conn = getConnector('test');
    for await (const doc of conn.sync({} as HydratedDocument<SourceDocument>)) {
      docs.push(doc);
    }
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ externalId: '1', title: 'Doc', content: 'hello' });
  });

  it('webhook is optional', () => {
    const c = makeConnector('no-webhook');
    expect(c.webhook).toBeUndefined();
  });

  it('connector with webhook works', async () => {
    const withWebhook: Connector = {
      type: 'slack',
      async *sync(_source) { /* no-op */ },
      async *webhook(_source, _payload): AsyncIterable<ConnectorDocument> {
        yield { externalId: 'w1', title: 'Webhook Doc', content: 'from webhook', url: 'https://example.com' };
      },
    };
    registerConnector(withWebhook);
    const conn = getConnector('slack');
    const docs: ConnectorDocument[] = [];
    for await (const doc of conn.webhook!(
      {} as HydratedDocument<SourceDocument>,
      { event: 'message' },
    )) {
      docs.push(doc);
    }
    expect(docs[0]).toMatchObject({ externalId: 'w1', url: 'https://example.com' });
  });
});
