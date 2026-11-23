import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSupply } from '../collector/sources/chainsupply.mjs';

// Real values, captured from Avalanche's public P-Chain API on 2026-11-24. No network in tests.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const { avalanche } = JSON.parse(readFileSync(new URL('../data-seed/coins.json', import.meta.url), 'utf8'));

const SUPPLY = '476882099919471859';   // platform.getCurrentSupply, nAVAX
const STAKE = '222672667512783166';    // platform.getTotalStake,  nAVAX

function mockAvax({ supply = SUPPLY, stake = STAKE, method = null } = {}) {
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    assert.match(u, /\/ext\/bc\/P$/);
    assert.equal(opts.method, 'POST');
    assert.equal(opts.headers['content-type'], 'application/json');
    const asked = JSON.parse(opts.body).method;
    if (method && asked !== method) throw new Error('unexpected method ' + asked);
    if (asked === 'platform.getCurrentSupply') return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: { supply, height: '1' } }) };
    if (asked === 'platform.getTotalStake') return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: { stake, weight: stake } }) };
    throw new Error('unexpected rpc ' + asked);
  };
}

test('AVAX: circulating subtracts the whole P-Chain stake from the chain supply', async () => {
  mockAvax();
  const s = await readSupply(avalanche.supply);
  assert.equal(Math.round(s.total), 476882100);
  assert.equal(Math.round(s.circulating), 254209432);
  assert.equal(s.excluded.length, 1);
  assert.match(s.excluded[0].reason, /P-Chain locked stake/);
});

test('AVAX: circulating never exceeds total', async () => {
  mockAvax();
  const s = await readSupply(avalanche.supply);
  assert.ok(s.circulating > 0 && s.circulating < s.total);
});

test('AVAX: a JSON-RPC error fails the read instead of counting zero', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -1, message: 'boom' } }) });
  await assert.rejects(() => readSupply(avalanche.supply), /AVAX getCurrentSupply|AVAX getTotalStake/);
});

test('AVAX: a nonsense supply is rejected rather than published', async () => {
  mockAvax({ supply: '1000' });
  await assert.rejects(() => readSupply(avalanche.supply), /bad AVAX total supply/);
});

test('AVAX: a zero stake is rejected rather than overstating circulating', async () => {
  mockAvax({ stake: '0' });
  await assert.rejects(() => readSupply(avalanche.supply), /bad AVAX P-Chain stake/);
});

test('AVAX: the seed rule points at the official P-Chain API', () => {
  assert.equal(avalanche.symbol, 'AVAX');
  assert.equal(avalanche.supply.method, 'avalanche');
  assert.equal(avalanche.supply.rpc, 'https://api.avax.network');
});
