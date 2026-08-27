import assert from 'node:assert/strict';
import test from 'node:test';
import { constantTimeEqual, secureActionHash, secureToken } from './secure-approval.js';

test('secure hash is stable regardless of object key order', () => {
  assert.equal(
    secureActionHash({ b: 2, a: 1 }),
    secureActionHash({ a: 1, b: 2 }),
  );
});

test('secure token contains 256 bits of random material', () => {
  assert.equal(secureToken().length, 64);
});

test('constant time comparison distinguishes values', () => {
  assert.equal(constantTimeEqual('abc', 'abc'), true);
  assert.equal(constantTimeEqual('abc', 'abd'), false);
  assert.equal(constantTimeEqual('abc', 'abcd'), false);
});
