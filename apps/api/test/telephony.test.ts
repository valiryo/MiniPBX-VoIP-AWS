import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { setImmediate as tick } from 'node:timers/promises';
import { AmiClient, AmiError } from '../src/ami.js';
import { History } from '../src/history.js';
import { Telephony } from '../src/telephony.js';

test('AMI offline nao envia Originate nem inventa disponibilidade', async t => {
  const history = new History(':memory:'); t.after(() => history.close());
  const ami = new AmiClient({ host: '127.0.0.1', port: 1, username: 'fake', secret: 'fake' });
  const service = new Telephony(ami, history);
  await assert.rejects(service.create({ from: '1001', to: '1002' }), ServiceUnavailableException);
  assert.equal(history.list().length, 0);
  assert.ok((await service.extensions()).every(e => e.state === 'unknown' && e.contactKnown === null));
});

test('timeout depois do envio vira unknown; canais reais ativos bloqueiam nova tentativa', async t => {
  const history = new History(':memory:'); t.after(() => history.close());
  const ami = new AmiClient({ host: '127.0.0.1', port: 1, username: 'fake', secret: 'fake' });
  ami.ready = true;
  let originations = 0;
  let busy = false;
  ami.action = async action => {
    if (action === 'CoreShowChannels') return { response: {}, events: busy ? [{ Event: 'CoreShowChannel', Channel: 'PJSIP/1001-test' }] : [] };
    originations++; throw new AmiError('timeout');
  };
  const service = new Telephony(ami, history);
  const result = await service.create({ from: '1001', to: '1002' });
  assert.equal(result.state, 'requested');
  await tick();
  assert.equal(history.get(result.id)?.state, 'unknown');
  assert.equal(history.get(result.id)?.durationMs, null);
  busy = true;
  await assert.rejects(service.create({ from: '1001', to: '1002' }), ConflictException);
  assert.equal(originations, 1);
});

test('rejeicao explicita de Originate produz failed sem marcar atendimento', async t => {
  const history = new History(':memory:'); t.after(() => history.close());
  const ami = new AmiClient({ host: '127.0.0.1', port: 1, username: 'fake', secret: 'fake' });
  ami.ready = true;
  ami.action = async action => {
    if (action === 'CoreShowChannels') return { response: {}, events: [] };
    throw new AmiError('rejected');
  };
  const service = new Telephony(ami, history);
  const result = await service.create({ from: '1002', to: '1001' });
  await tick();
  assert.equal(history.get(result.id)?.state, 'failed');
  assert.equal(history.get(result.id)?.answeredAt, null);
});
