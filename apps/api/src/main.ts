import 'reflect-metadata';
import { Body, Controller, Get, HttpCode, Inject, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AmiClient } from './ami.js';
import { History } from './history.js';
import { Telephony } from './telephony.js';

@Controller()
class ApiController {
  constructor(@Inject(Telephony) private readonly telephony: Telephony) {}
  @Get('health') health() { return { status: 'ok' }; }
  @Get('telephony/health') telephonyHealth() { return this.telephony.health(); }
  @Get('extensions') extensions() { return this.telephony.extensions(); }
  @Post('calls') @HttpCode(202) create(@Body() body: unknown) { return this.telephony.create(body); }
  @Get('calls') list() {
    return this.telephony.history.list().map(({ events, ...call }) => ({ ...call, eventCount: events.length }));
  }
  @Get('calls/:id') get(@Param('id') id: string) {
    const call = this.telephony.history.get(id);
    if (!call) throw new NotFoundException('Tentativa nao encontrada.');
    return call;
  }
}

@Module({
  controllers: [ApiController],
  providers: [{ provide: Telephony, useFactory: () => {
    const secret = readFileSync(process.env.AMI_SECRET_FILE ?? '/run/secrets/ami-password.txt', 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('invalid secret');
    return new Telephony(new AmiClient({
      host: process.env.AMI_HOST ?? '172.29.88.2', port: Number(process.env.AMI_PORT ?? 5038),
      username: 'minipbx', secret,
    }), new History(process.env.DATABASE_PATH ?? '/data/calls.sqlite'));
  } }],
})
class AppModule {}

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.useBodyParser('json', { limit: '2kb' });
  app.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
    // API de CLI/PowerShell. Nao aceitar chamadas cross-origin de paginas abertas no navegador.
    if (request.headers.origin) {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: 'Browser origins are not enabled for this local API.' }));
      return;
    }
    next();
  });
  app.enableShutdownHooks();
  await app.listen(3000, '0.0.0.0');
  console.log('MiniPBX API pronta na porta interna 3000. Consulte /telephony/health para AMI.');
}
void main().catch(() => { console.error('Falha ao iniciar API; confira configuracao local, segredo e volume de dados.'); process.exitCode = 1; });
