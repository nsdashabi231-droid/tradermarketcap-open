import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSupply } from '../collector/sources/chainsupply.mjs';

// Real response shapes, captured from Celestia's public LCD (polkachu) on 2026-11-23.
// Supply is read per denom, the community pool comes from the distribution module,
// and every vesting holder is subtracted. No network in tests.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const { celestia } = JSON.parse(readFileSync(new URL('../data-seed/coins.json', import.meta.url), 'utf8'));

function mockCelestia({ total, pool, balances }) {
  globalThis.fetch = async url => {
    const u = String(url);
    const body = (() => {
      if (u.includes('/cosmos/bank/v1beta1/supply/by_denom')) {
        return { amount: { denom: 'utia', amount: String(total) } };
      }
      if (u.includes('/cosmos/distribution/v1beta1/community_pool')) {
        return { pool: pool ? [{ denom: 'utia', amount: String(pool) }] : [] };
      }
      const m = u.match(/balances\/([^/]+)\/by_denom/);
      if (m) {
        const amount = balances[m[1]] ?? 0;
        return { balance: { denom: 'utia', amount: String(amount) } };
      }
      throw new Error('unexpected url ' + u);
    })();
    return { ok: true, json: async () => body };
  };
}

test('TIA: circulating supply subtracts every vesting holder and the community pool', async () => {
  // 1,000,000 TIA total, 100,000 TIA unvested in two team wallets, 10,000 TIA in the community pool.
  const holders = celestia.supply.exclude.map(e => e.holder);
  assert.ok(holders.length > 0, 'celestia rule must list vesting holders');
  mockCelestia({
    total: 1_000_000_000_000,          // utia, 6 decimals
    pool: 10_000_000_000,
    balances: { [holders[0]]: 60_000_000_000, [holders[1]]: 40_000_000_000 },
  });
  const s = await readSupply(celestia.supply);
  assert.equal(s.total, 1_000_000);
  // every listed holder is reported, plus the community pool
  assert.equal(s.excluded.length, holders.length + 1);
  assert.equal(Math.round(s.circulating), 890_000); // 1,000,000 - 100,000 - 10,000
});

test('TIA: an unreadable vesting wallet fails the read instead of overstating supply', async () => {
  const holders = celestia.supply.exclude.map(e => e.holder);
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.includes('/supply/by_denom')) return { ok: true, json: async () => ({ amount: { denom: 'utia', amount: '1000000000000' } }) };
    if (u.includes('/community_pool')) return { ok: true, json: async () => ({ pool: [] }) };
    if (u.includes(holders[0])) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, json: async () => ({ balance: { denom: 'utia', amount: '0' } }) };
  };
  await assert.rejects(() => readSupply(celestia.supply));
});

test('TIA: the seed rule reads a Cosmos LCD with the utia denom', () => {
  assert.equal(celestia.symbol, 'TIA');
  assert.equal(celestia.supply.method, 'cosmos');
  assert.equal(celestia.supply.denom, 'utia');
  assert.match(celestia.supply.lcd, /^https:\/\//);
  assert.ok(celestia.supply.exclude.length >= 50, 'vesting list should be the full on-chain set');
});
