import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Socket } from 'node:net';
import { once } from 'node:events';
import { AmiClient, AmiError, AmiParser, Frame } from '../src/ami.js';

const wire = (frame: Frame) => Object.entries(frame).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n';

test('parser aceita fragmentacao, greeting e varios frames no mesmo pacote', () => {
  const parser = new AmiParser();
  assert.deepEqual(parser.push('Asterisk Call Manager/11.0\r\nResponse: Succ'), []);
  const frames = parser.push('ess\r\nActionID: one\r\n\r\nEvent: Newstate\r\nUniqueid: x\r\n\r\n');
  assert.equal(frames.length, 2);
  assert.equal(frames[0].Response, 'Success');
  assert.equal(frames[1].Uniqueid, 'x');
  assert.throws(() => parser.push('a'.repeat(1024 * 1024 + 1)), AmiError);
});

test('AMI simulada: ActionID, listas, evento com Response, timeout e reconexao sem reenvio', async t => {
  const sockets = new Set<Socket>();
  let connections = 0;
  let originations = 0;
  const server = createServer(socket => {
    sockets.add(socket); connections++;
    socket.on('close', () => sockets.delete(socket));
    const parser = new AmiParser();
    socket.write('Asterisk Call Manager/11.0\r\n');
    socket.on('data', chunk => {
      for (const f of parser.push(chunk.toString())) {
        const ActionID = f.ActionID;
        if (f.Action === 'Login') socket.write(wire({ Response: 'Success', ActionID }));
        if (f.Action === 'Ping') socket.write(wire({ Response: 'Success', ActionID, Ping: 'Pong' }));
        if (f.Action === 'PJSIPShowEndpoints') {
          socket.write(wire({ Response: 'Success', ActionID, EventList: 'start' }) +
            wire({ Event: 'EndpointList', ActionID: 'other-action', ObjectName: '9999' }) +
            wire({ Event: 'EndpointList', ActionID, ObjectName: '1001', DeviceState: 'Not in use' }) +
            wire({ Event: 'EndpointListComplete', ActionID }));
        }
        if (f.Action === 'Originate') {
          originations++;
          // Evento com Response nao pode ser confundido com a resposta da acao.
          socket.write(wire({ Event: 'OriginateResponse', ActionID, Response: 'Success', Uniqueid: 'call' }));
          setTimeout(() => socket.write(wire({ Response: 'Success', ActionID, Message: 'queued' })), 15);
        }
        // CoreShowChannels propositalmente sem resposta para exercitar timeout.
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const client = new AmiClient({ host: '127.0.0.1', port, username: 'fake-user', secret: 'fake-secret',
    actionTimeoutMs: 300, reconnectMs: 20, heartbeatMs: 5000 });
  t.after(async () => {
    client.stop(); for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const ready = once(client, 'ready'); client.start(); await ready;
  const list = await client.action('PJSIPShowEndpoints', {}, 'EndpointListComplete');
  assert.equal(list.events.filter(e => e.Event === 'EndpointList').length, 1);
  const result = await client.action('Originate', { Channel: 'PJSIP/1001' });
  assert.equal(result.response.Message, 'queued');
  await assert.rejects(client.action('CoreShowChannels', {}, 'CoreShowChannelsComplete'), (e: AmiError) => e.kind === 'timeout');
  await assert.rejects(client.action('Command'), AmiError);
  await assert.rejects(client.action('Originate', { Channel: 'PJSIP/1001\r\nAction: Command' }), AmiError);
  const disconnected = once(client, 'disconnected');
  const again = once(client, 'ready');
  for (const socket of sockets) socket.destroy();
  await disconnected; assert.equal(client.ready, false);
  await again; assert.equal(client.ready, true);
  assert.ok(connections >= 2);
  assert.equal(originations, 1, 'Originate nunca e reenviado ao reconectar');
});

test('acao em andamento e rejeitada quando socket cai', async t => {
  let peer: Socket | undefined;
  const server = createServer(socket => {
    peer = socket;
    const parser = new AmiParser();
    socket.on('data', data => {
      for (const f of parser.push(data.toString())) {
        if (['Login', 'Ping'].includes(f.Action)) socket.write(wire({ Response: 'Success', ActionID: f.ActionID, Ping: 'Pong' }));
        else socket.destroy();
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new AmiClient({ host: '127.0.0.1', port: (server.address() as { port: number }).port,
    username: 'fake', secret: 'fake', reconnectMs: 10000 });
  t.after(async () => { client.stop(); peer?.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const ready = once(client, 'ready'); client.start(); await ready;
  await assert.rejects(client.action('PJSIPShowEndpoints', {}, 'EndpointListComplete'), (e: AmiError) => e.kind === 'offline');
});
