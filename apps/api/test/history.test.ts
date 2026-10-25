import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { History } from '../src/history.js';
import { newCall } from '../src/calls.js';

test('SQLite persiste, limita historico e marca tentativa interrompida como unknown ao reiniciar', () => {
  const directory = mkdtempSync(join(tmpdir(), 'minipbx-history-'));
  const path = join(directory, 'calls.sqlite');
  let history = new History(path);
  try {
    for (let n = 0; n < 105; n++) {
      const call = newCall('1001', '1002', 1000 + n);
      call.state = 'failed'; history.save(call);
    }
    const pending = newCall('1001', '1002'); history.save(pending);
    assert.equal(history.list().length, 100);
    history.close(); history = new History(path);
    const recovered = history.get(pending.id)!;
    assert.equal(recovered.state, 'unknown');
    assert.equal(recovered.reason, 'api_restarted');
    assert.equal(recovered.durationMs, null);
    assert.equal(history.get("' OR 1=1 --"), undefined);
  } finally {
    history.close(); unlinkSync(path); rmdirSync(directory);
  }
});
