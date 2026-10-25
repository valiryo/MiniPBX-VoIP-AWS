import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { AmiClient, AmiError } from './ami.js';
import { CallTracker, newCall, validatePair } from './calls.js';
import { History } from './history.js';

export class Telephony {
  readonly tracker: CallTracker;
  private timer?: NodeJS.Timeout;
  private creating = false;
  constructor(readonly ami: AmiClient, readonly history: History) {
    this.tracker = new CallTracker(call => history.save(call));
    ami.on('event', frame => this.tracker.accept(frame));
    ami.on('disconnected', () => this.tracker.gap('ami_disconnected'));
  }
  onModuleInit(): void {
    this.ami.start();
    this.timer = setInterval(() => this.tracker.sweep(), 1000);
  }
  onApplicationShutdown(): void {
    clearInterval(this.timer);
    this.tracker.gap('api_shutdown');
    this.ami.stop();
    this.history.close();
  }
  health() { return { ami: this.ami.ready ? 'connected' : 'disconnected', lastPongAt: this.ami.lastPongAt }; }

  async extensions() {
    const unknown = () => (['1001', '1002'] as const).map(extension => ({ extension, state: 'unknown', contactKnown: null, observedAt: null }));
    if (!this.ami.ready) return unknown();
    try {
      const { events } = await this.ami.action('PJSIPShowEndpoints', {}, 'EndpointListComplete');
      const observedAt = new Date().toISOString();
      return (['1001', '1002'] as const).map(extension => {
        const event = events.find(e => e.Event === 'EndpointList' && e.ObjectName === extension);
        return { extension, state: event?.DeviceState ?? 'unknown', contactKnown: event ? Boolean(event.Contacts) : null, observedAt: event ? observedAt : null };
      });
    } catch { return unknown(); }
  }

  async create(body: unknown): Promise<{ id: string; state: 'requested' }> {
    let pair;
    try { pair = validatePair(body); }
    catch { throw new BadRequestException('Use from/to distintos, somente 1001 ou 1002.'); }
    if (!this.ami.ready) throw new ServiceUnavailableException('AMI desconectada; nenhuma chamada enviada.');
    if (this.creating || this.tracker.hasActive()) throw new ConflictException('Ha uma tentativa ativa no laboratorio.');
    this.creating = true;
    try {
      // Inclui chamadas manuais e chamadas cujo acompanhamento ficou unknown.
      const { events } = await this.ami.action('CoreShowChannels', {}, 'CoreShowChannelsComplete');
      if (events.some(e => e.Event === 'CoreShowChannel')) throw new ConflictException('Asterisk tem canais ativos; encerre a chamada atual.');
      const call = newCall(pair.from, pair.to);
      this.tracker.add(call);
      // Nao esperar atendimento no HTTP. Em nenhuma falha o Originate sera reenviado.
      void this.ami.action('Originate', {
        Channel: `PJSIP/${pair.from}`, Context: `from-${pair.from}`, Exten: pair.to,
        Priority: '1', Async: 'true', Timeout: '30000', Codecs: 'ulaw,alaw',
        ChannelId: call.requestedChannelId, CallerID: `MiniPBX <${pair.from}>`,
      }, undefined, call.actionId).then(() => this.tracker.queued(call.id)).catch(error => {
        const kind = error instanceof AmiError ? error.kind : 'unknown';
        this.tracker.localFailure(call.id, `ami_${kind}`, kind !== 'rejected');
      });
      return { id: call.id, state: 'requested' };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException('Nao foi possivel consultar canais; nenhuma chamada enviada.');
    } finally { this.creating = false; }
  }
}
