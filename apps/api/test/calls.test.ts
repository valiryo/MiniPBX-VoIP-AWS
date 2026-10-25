import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CallTracker, newCall, sanitize, validatePair } from '../src/calls.js';
import type { Frame } from '../src/ami.js';

test('somente ramais distintos; rejeitar injecao e campos extras', () => {
  assert.deepEqual(validatePair({ from: '1001', to: '1002' }), { from: '1001', to: '1002' });
  for (const body of [null, [], {}, { from: 1001, to: '1002' }, { from: '1001', to: '1001' },
    { from: '1001', to: '9999' }, { from: '1001\r\nAction: Command', to: '1002' },
    { from: '1001', to: '1002', Application: 'System' }]) assert.throws(() => validatePair(body));
});

function setup() {
  const call = newCall('1001', '1002');
  const tracker = new CallTracker(() => {});
  tracker.add(call);
  const root = call.requestedChannelId;
  const event = (fields: Frame) => tracker.accept({ Uniqueid: root, Linkedid: root, Timestamp: '1000', ...fields });
  return { call, tracker, root, event };
}

test('fila, OriginateResponse Success e primeiro ramal Up nao provam conversa', () => {
  const { call, tracker, event } = setup();
  tracker.queued(call.id);
  event({ Event: 'OriginateResponse', ActionID: call.actionId, Response: 'Success' });
  event({ Event: 'Newstate', ChannelStateDesc: 'Up' });
  event({ Event: 'DialBegin', DestUniqueid: 'destination' });
  assert.equal(call.state, 'requested');
  assert.equal(call.answeredAt, null);
  assert.equal(call.durationMs, null);
  assert.ok(call.uniqueids.every(id => id === call.requestedChannelId || id === 'destination'));
});

test('dois participantes da mesma bridge; tempo somente no intervalo comum, sem duplicar eventos', () => {
  const { call, event, root } = setup();
  event({ Event: 'Newstate', ChannelStateDesc: 'Ringing' });
  event({ Event: 'DialBegin', DestUniqueid: 'destination' });
  event({ Event: 'BridgeEnter', BridgeUniqueid: 'bridge', Channel: 'PJSIP/1001-00000001' });
  assert.equal(call.state, 'ringing');
  const enter = { Event: 'BridgeEnter', Uniqueid: 'destination', BridgeUniqueid: 'bridge', Channel: 'PJSIP/1002-00000002', Timestamp: '1002' };
  event(enter);
  event({ ...enter, Timestamp: '1003' });
  assert.equal(call.state, 'answered');
  event({ Event: 'BridgeLeave', Uniqueid: 'destination', BridgeUniqueid: 'bridge', Timestamp: '1005' });
  event({ Event: 'BridgeLeave', Uniqueid: 'destination', BridgeUniqueid: 'bridge', Timestamp: '1006' });
  event({ Event: 'Hangup', Uniqueid: root, Timestamp: '1007', Cause: '16' });
  assert.equal(call.state, 'ended');
  assert.equal(call.durationMs, 3000);
});

test('bridges diferentes e chamada manual sem correlacao nao confirmam atendimento', () => {
  const { call, tracker, event } = setup();
  event({ Event: 'BridgeEnter', BridgeUniqueid: 'one', Channel: 'PJSIP/1001-a' });
  event({ Event: 'BridgeEnter', Uniqueid: 'destination', BridgeUniqueid: 'two', Channel: 'PJSIP/1002-b' });
  tracker.accept({ Event: 'BridgeEnter', Uniqueid: 'unrelated', Linkedid: 'manual', BridgeUniqueid: 'one', Channel: 'PJSIP/1002-c' });
  assert.equal(call.answeredAt, null);
});

test('falha assincrona, recusa do destino e lacuna de eventos preservam resultado honesto', () => {
  const first = setup();
  first.event({ Event: 'OriginateResponse', ActionID: first.call.actionId, Response: 'Failure', Reason: '3' });
  assert.equal(first.call.state, 'failed');
  const second = setup();
  second.event({ Event: 'DialEnd', DialStatus: 'BUSY', DestUniqueid: 'destination' });
  second.event({ Event: 'Hangup', Cause: '16' });
  assert.equal(second.call.state, 'failed');
  assert.equal(second.call.reason, 'dial_BUSY');
  const third = setup();
  third.tracker.gap('ami_disconnected');
  third.event({ Event: 'BridgeEnter', BridgeUniqueid: 'late', Channel: 'PJSIP/1001-a' });
  assert.equal(third.call.state, 'unknown');
  assert.equal(third.call.durationMs, null);
});

test('timestamp ausente ou regressivo impede duracao inventada', () => {
  for (const end of ['', '999']) {
    const { call, event } = setup();
    event({ Event: 'BridgeEnter', BridgeUniqueid: 'bridge', Channel: 'PJSIP/1001-a' });
    event({ Event: 'BridgeEnter', Uniqueid: 'destination', BridgeUniqueid: 'bridge', Channel: 'PJSIP/1002-b' });
    event({ Event: 'BridgeLeave', Uniqueid: 'destination', BridgeUniqueid: 'bridge', Timestamp: end });
    event({ Event: 'Hangup', Timestamp: '1008' });
    assert.equal(call.state, 'ended');
    assert.equal(call.durationMs, null);
  }
});

test('timeout de eventos vira unknown; historico exclui campos nao autorizados', () => {
  let now = 100000;
  const call = newCall('1001', '1002', now);
  const tracker = new CallTracker(() => {}, () => now);
  tracker.add(call);
  now += 76000;
  tracker.sweep();
  assert.equal(call.state, 'unknown');
  assert.deepEqual(sanitize({ Event: 'Newstate', Secret: 'never-store', Variable: 'SIP_PASSWORD=never-store', ChannelStateDesc: 'Up' }),
    { Event: 'Newstate', ChannelStateDesc: 'Up' });
});
