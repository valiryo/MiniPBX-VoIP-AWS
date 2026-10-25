import { randomUUID } from 'node:crypto';
import type { Frame } from './ami.js';

export type Extension = '1001' | '1002';
export type State = 'requested' | 'ringing' | 'answered' | 'ended' | 'failed' | 'unknown';
export interface Evidence { kind: 'ami' | 'local'; observedAt: string; fields: Frame }
export interface Call {
  id: string; actionId: string; from: Extension; to: Extension; state: State;
  createdAt: string; updatedAt: string; answeredAt: string | null; endedAt: string | null;
  durationMs: number | null; reason: string | null; queued: boolean;
  requestedChannelId: string; uniqueids: string[]; linkedids: string[]; events: Evidence[];
}
export const active = (call: Call) => ['requested', 'ringing', 'answered'].includes(call.state);
export function validatePair(body: unknown): { from: Extension; to: Extension } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid extensions');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 2 || !['1001', '1002'].includes(String(value.from)) ||
      !['1001', '1002'].includes(String(value.to)) || typeof value.from !== 'string' ||
      typeof value.to !== 'string' || value.from === value.to) throw new Error('invalid extensions');
  return value as { from: Extension; to: Extension };
}

export function newCall(from: Extension, to: Extension, now = Date.now()): Call {
  const id = randomUUID();
  return { id, actionId: id, from, to, state: 'requested', createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(), answeredAt: null, endedAt: null,
    durationMs: null, reason: null, queued: false, requestedChannelId: `minipbx-${id}`, uniqueids: [], linkedids: [], events: [] };
}

const allowedEvents = new Set(['OriginateResponse', 'Newchannel', 'Newstate', 'DialBegin', 'DialEnd', 'BridgeEnter', 'BridgeLeave', 'Hangup']);
const allowedFields = ['Event', 'Timestamp', 'ActionID', 'Uniqueid', 'Linkedid', 'DestUniqueid',
  'DestLinkedid', 'Channel', 'DestChannel', 'ChannelStateDesc', 'DestChannelStateDesc',
  'Response', 'Reason', 'Cause', 'DialStatus', 'BridgeUniqueid', 'BridgeNumChannels'];
export function sanitize(frame: Frame): Frame {
  return Object.fromEntries(allowedFields.filter(k => frame[k] !== undefined)
    .map(k => [k, frame[k].replace(/[\r\n]/g, '').slice(0, 180)]));
}
function timestamp(frame: Frame): number | null {
  const n = Number(frame.Timestamp);
  return frame.Timestamp && Number.isFinite(n) && n > 0 ? n * 1000 : null;
}
interface Runtime {
  call: Call; root: string;
  bridges: Map<string, Map<string, Extension>>;
  mediaStart: number | null; mediaTotal: number; timingTrusted: boolean;
}

export class CallTracker {
  private calls = new Map<string, Runtime>();
  constructor(private readonly persist: (call: Call) => void, private readonly now = Date.now) {}
  add(call: Call): void {
    this.calls.set(call.id, { call, root: call.requestedChannelId, bridges: new Map(),
      mediaStart: null, mediaTotal: 0, timingTrusted: true });
    this.persist(call);
  }
  hasActive(): boolean { return [...this.calls.values()].some(r => active(r.call)); }
  get(id: string): Call | undefined { return this.calls.get(id)?.call; }
  queued(id: string): void {
    const r = this.calls.get(id);
    if (r) { r.call.queued = true; this.save(r); }
  }
  localFailure(id: string, reason: string, uncertain: boolean): void {
    const r = this.calls.get(id);
    if (!r || !active(r.call)) return;
    r.call.state = uncertain ? 'unknown' : 'failed';
    r.call.reason = reason;
    r.call.durationMs = null;
    this.evidence(r, 'local', { Event: 'Observation', Reason: reason });
    this.save(r);
  }
  gap(reason: string): void {
    for (const r of this.calls.values()) if (active(r.call)) this.localFailure(r.call.id, reason, true);
  }
  sweep(): void {
    for (const r of this.calls.values()) {
      if (['requested', 'ringing'].includes(r.call.state) && this.now() - Date.parse(r.call.createdAt) > 75000) {
        this.localFailure(r.call.id, 'call_events_timeout', true);
      }
    }
    // Historico em SQLite; manter em memoria apenas uma janela pequena.
    for (const [id, r] of this.calls) {
      if (!active(r.call) && this.now() - Date.parse(r.call.updatedAt) > 120000) this.calls.delete(id);
    }
  }

  accept(frame: Frame): void {
    if (!allowedEvents.has(frame.Event)) return;
    const r = [...this.calls.values()].find(({ call }) =>
      frame.ActionID === call.actionId || [frame.Uniqueid, frame.DestUniqueid, frame.Linkedid, frame.DestLinkedid]
        .some(id => id && [call.requestedChannelId, ...call.uniqueids, ...call.linkedids].includes(id)));
    if (!r) return; // Chamadas manuais sem correlacao nao contaminam o historico da API.
    const c = r.call;
    this.evidence(r, 'ami', sanitize(frame));
    if (!active(c)) { this.save(r); return; }
    for (const id of [frame.Uniqueid, frame.DestUniqueid]) {
      if (id && id !== '<null>' && !c.uniqueids.includes(id)) c.uniqueids.push(id);
    }
    for (const id of [frame.Linkedid, frame.DestLinkedid]) {
      if (id && id !== '<null>' && !c.linkedids.includes(id)) c.linkedids.push(id);
    }
    if (frame.Event === 'OriginateResponse' && frame.Response === 'Failure') {
      c.state = 'failed'; c.reason = `originate_reason_${frame.Reason ?? 'unknown'}`;
    }
    if (frame.Event === 'Newstate' && ['Ring', 'Ringing'].includes(frame.ChannelStateDesc) && c.state === 'requested') c.state = 'ringing';
    if (frame.Event === 'DialEnd' && frame.DialStatus && frame.DialStatus !== 'ANSWER') c.reason = `dial_${frame.DialStatus}`;
    if (frame.Event === 'BridgeEnter' || frame.Event === 'BridgeLeave') this.bridge(r, frame);
    if (frame.Event === 'Hangup' && frame.Uniqueid === r.root) {
      c.endedAt = new Date(timestamp(frame) ?? this.now()).toISOString();
      if (c.answeredAt) {
        if (r.mediaStart !== null) this.closeMedia(r, timestamp(frame));
        c.state = 'ended';
        c.durationMs = r.timingTrusted ? Math.round(r.mediaTotal) : null;
      } else { c.state = 'failed'; c.reason ??= `hangup_cause_${frame.Cause ?? 'unknown'}`; }
    }
    this.save(r);
  }

  private bridge(r: Runtime, frame: Frame): void {
    if (!frame.BridgeUniqueid || !frame.Uniqueid) return;
    let members = r.bridges.get(frame.BridgeUniqueid);
    if (!members) { members = new Map(); r.bridges.set(frame.BridgeUniqueid, members); }
    const before = this.hasPair(r);
    if (frame.Event === 'BridgeEnter') {
      const extension = /^PJSIP\/(1001|1002)-/.exec(frame.Channel ?? '')?.[1] as Extension | undefined;
      if (extension) members.set(frame.Uniqueid, extension);
    } else members.delete(frame.Uniqueid);
    const after = this.hasPair(r);
    if (!before && after) {
      const at = timestamp(frame);
      r.call.answeredAt ??= new Date(at ?? this.now()).toISOString();
      r.call.state = 'answered';
      r.mediaStart = at;
      if (at === null) r.timingTrusted = false;
    }
    if (before && !after) this.closeMedia(r, timestamp(frame));
  }
  private hasPair(r: Runtime): boolean {
    return [...r.bridges.values()].some(m => [...m.values()].includes(r.call.from) && [...m.values()].includes(r.call.to));
  }
  private closeMedia(r: Runtime, at: number | null): void {
    if (at === null || r.mediaStart === null || at < r.mediaStart) r.timingTrusted = false;
    else r.mediaTotal += at - r.mediaStart;
    r.mediaStart = null;
  }
  private evidence(r: Runtime, kind: Evidence['kind'], fields: Frame): void {
    r.call.events.push({ kind, observedAt: new Date(this.now()).toISOString(), fields });
    if (r.call.events.length > 120) { r.call.events.shift(); r.timingTrusted = false; }
  }
  private save(r: Runtime): void { r.call.updatedAt = new Date(this.now()).toISOString(); this.persist(r.call); }
}
