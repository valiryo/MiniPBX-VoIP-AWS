// Exercicio AMI sem framework, antes da API. Nao imprime frames ou autenticacao.
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';

const socket = createConnection({ host: '172.29.88.2', port: 5038 });
let buffer = '';
const pending = new Map();
function request(Action, fields = {}, complete) {
  const ActionID = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(ActionID); reject(new Error('timeout')); }, 5000);
    pending.set(ActionID, { resolve, reject, timer, complete, events: [] });
    socket.write(Object.entries({ Action, ActionID, ...fields }).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
  });
}
socket.setEncoding('utf8');
socket.on('data', chunk => {
  buffer += chunk;
  if (buffer.length > 1024 * 1024) { socket.destroy(); return; }
  let end;
  while ((end = buffer.indexOf('\r\n\r\n')) !== -1) {
    const frame = Object.fromEntries(buffer.slice(0, end).split('\r\n').filter(l => l.includes(':'))
      .map(l => { const i = l.indexOf(':'); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
    buffer = buffer.slice(end + 4);
    const action = pending.get(frame.ActionID);
    if (!action) continue;
    if (frame.Event) action.events.push(frame);
    if (frame.Response === 'Error' || (!action.complete && frame.Response) || frame.Event === action.complete) {
      clearTimeout(action.timer);
      pending.delete(frame.ActionID);
      action.resolve({ response: frame, events: action.events });
    }
  }
});
socket.on('error', () => {});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 5000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('error', () => { clearTimeout(timer); reject(new Error('connect failed')); });
  });
  const login = await request('Login', { Username: 'minipbx', Secret: readFileSync('/run/secrets/ami-password.txt', 'utf8').trim(), Events: 'on' });
  if (login.response.Response !== 'Success') throw new Error('authentication failed');
  const ping = await request('Ping');
  if (ping.response.Ping !== 'Pong') throw new Error('ping failed');
  const list = await request('PJSIPShowEndpoints', {}, 'EndpointListComplete');
  if (list.response.Response === 'Error') throw new Error('endpoint query denied');
  console.log(JSON.stringify({ authenticated: true, ping: 'Pong', endpoints: list.events
    .filter(e => e.Event === 'EndpointList').map(e => ({ extension: e.ObjectName, state: e.DeviceState })) }));
  const denied = await request('Command', { Command: 'core show version' });
  if (denied.response.Response !== 'Error') throw new Error('CLI permission unexpectedly granted');
  console.log('OK: Command recusado; eventos EndpointList recebidos e correlacionados por ActionID.');
  await request('Logoff');
} catch {
  console.error('Sonda AMI falhou: conferir rede privada, permissao e conjunto de segredos.');
  process.exitCode = 1;
} finally {
  for (const p of pending.values()) clearTimeout(p.timer);
  socket.destroy();
}
