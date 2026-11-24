import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSupply } from '../collector/sources/chainsupply.mjs';

// Real values, captured from Celestia's own supply API (supply.celestia.org, run from celestiaorg/supply)
// on 2026-11-24. No network in tests.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const { celestia } = JSON.parse(readFileSync(new URL('../data-seed/coins.json', import.meta.url), 'utf8'));

const CIRC = 993945112.401045;
const TOTAL = 1182285845.784607;

function mockCelestia({ circulating = CIRC, total = TOTAL } = {}) {
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.endsWith('/v0/circulating-supply')) return { ok: true, json: async () => circulating };
    if (u.endsWith('/v0/total-supply')) return { ok: true, json: async () => total };
    throw new Error('unexpected url ' + u);
  };
}

test('TIA: reads Celestia first-party circulating and total, and publishes the gap as excluded', async () => {
  mockCelestia();
  const s = await readSupply(celestia.supply);
  assert.equal(Math.round(s.circulating), 993945112);
  assert.equal(Math.round(s.total), 1182285846);
  assert.equal(s.excluded.length, 1);
  assert.equal(Math.round(s.excluded[0].amount), Math.round(TOTAL - CIRC));
  assert.match(s.src, /supply\.celestia\.org/);
});

test('TIA: circulating greater than total fails the read', async () => {
  mockCelestia({ circulating: TOTAL + 1 });
  await assert.rejects(() => readSupply(celestia.supply), /bad Celestia supply/);
});

test('TIA: a zero number fails the read instead of publishing it', async () => {
  mockCelestia({ circulating: 0 });
  await assert.rejects(() => readSupply(celestia.supply), /bad Celestia supply/);
});

test('TIA: the seed rule points at the first-party supply API', () => {
  assert.equal(celestia.symbol, 'TIA');
  assert.equal(celestia.supply.method, 'celestia-supply');
  assert.equal(celestia.supply.api, 'https://supply.celestia.org');
});
