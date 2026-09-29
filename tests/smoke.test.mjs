import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('package.json declares an ES module project with the zero-dependency test script', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, 'thought-catcher');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.scripts.test, "node --test 'tests/**/*.test.mjs'");
  assert.equal(pkg.dependencies, undefined);
});
