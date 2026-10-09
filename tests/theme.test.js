const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../theme.js');

test('the toggle cycles auto → light → dark → auto', () => {
  assert.equal(T.nextTheme('auto'), 'light');
  assert.equal(T.nextTheme('light'), 'dark');
  assert.equal(T.nextTheme('dark'), 'auto');
  assert.equal(T.nextTheme('garbage'), 'auto');
});

test('auto follows the system, explicit choices override it', () => {
  assert.equal(T.resolveTheme('auto', true), 'dark');
  assert.equal(T.resolveTheme('auto', false), 'light');
  assert.equal(T.resolveTheme('light', true), 'light');
  assert.equal(T.resolveTheme('dark', false), 'dark');
  assert.equal(T.resolveTheme(null, true), 'dark');
});
