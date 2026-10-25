# MiniPBX — laboratório local de VoIP

Foco: Asterisk, SIP, RTP e AMI; AWS/Terraform nas fases posteriores.
Fase 0 validada; **Fase 1 concluída em 24/10/2026**, com chamadas, áudio, RTP,
fluxo SIP, bridge e encerramento validados pelo estudante usando Linphone +
MicroSIP no próprio Windows. Ramais 1001/1002 e discagem interna configurados.
**Fase 2 concluída em 24/10/2026:** AMI privada, API NestJS local e histórico
SQLite pequeno. Chamada pela API validada com áudio nos dois sentidos e estado
final `ended`; falha com origem desconectada validada como `failed`, sem
atendimento ou duração de conversa fictícios.
Nenhuma conta AWS ou interface web é necessária.

## Ambiente verificado em 23/10/2026 e relato manual de 24/10/2026

| Item | Evidência |
|---|---|
| Host | Windows, build 26200; PowerShell 5.1 |
| WSL | Ubuntu e docker-desktop, versão 2; inicialmente parados |
| Docker | Cliente e motor 29.4.3; contexto `desktop-linux` |
| Compose | 5.1.3 |
| Rede | Wi-Fi, WSL/Hyper-V e Radmin VPN; publicar apenas em loopback |
| Asterisk | 22.11.0, imagem comunitária `andrius/asterisk`, Debian Trixie |
| Softphones | Relato manual de 24/10: Linphone registrado como 1001 e MicroSIP como 1002; chamadas e áudio observados |
| Porta local do Linphone | 5062; resolveu conflito com a publicação UDP 5060 do Docker. Servidor permanece em 127.0.0.1:5060 |

A série 22 é LTS; a versão estável 22.11.0 foi conferida no
[índice oficial](https://downloads.asterisk.org/pub/telephony/asterisk/).
A imagem comunitária está fixada por versão e digest em `compose.yaml`;
não usamos `latest`. A origem e as variantes estão no
[repositório do mantenedor](https://github.com/andrius/asterisk).
As configurações de demonstração da imagem ficam ocultas pelo diretório do projeto.

## Subir e abrir a CLI

No PowerShell, com Docker Desktop usando contêineres Linux:

```powershell
Set-Location 'C:\Users\valer\Projects\MiniPBX-VoIP-AWS'
docker version
docker compose version
python scripts/init-sip-secrets.py
python scripts/init-ami-secret.py
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 120
docker compose ps
docker compose exec asterisk asterisk -rv
```

Se o motor estiver desligado, execute `docker desktop start` antes de subir.
A primeira execução baixa a imagem pública pela internet; as seguintes usam o cache.

Dentro da CLI:

```text
core show version
core show channeltypes
pjsip show transports
pjsip show endpoints
pjsip show contacts
dialplan show
rtp show settings
manager show settings
exit
```

`exit` sai da console remota e mantém a central rodando.
Esperado agora: dois endpoints, cada um com auth e AoR. Antes de abrir os
softphones, ambos aparecem `Unavailable` e não há contatos. O contexto
`from-1001` só contém 1002; `from-1002` só contém 1001. O contexto `default` é vazio.

Para executar um comando sem entrar na console:

```powershell
docker compose exec -T asterisk asterisk -rx 'core show version'
docker compose logs --tail 80 asterisk
```

Siga o [roteiro da Fase 1](docs/PHASE1_CALLS.md) para configurar os dois softphones,
observar SIP/RTP e testar chamadas. O [laboratório inicial](docs/TELEPHONY_LAB.md)
preserva os conceitos e as evidências da Fase 0.

Os geradores criam senhas distintas de 256 bits em `secrets/`, ignorado pelo Git,
e preserva o conjunto existente nas execuções seguintes. Somente `sip-auth.conf`
é montado para SIP; AMI usa `ami-user.conf` no Asterisk e `ami-password.txt` na
API, para leitura. Não existe senha padrão, nem interpolação
via `.env`. Não compartilhe esses arquivos nem os inclua em capturas de tela.

Para copiar cada senha ao configurar o respectivo softphone, sem imprimi-la:

```powershell
(Get-Content -Raw .\secrets\sip-1001.txt).Trim() | Set-Clipboard
# Cole na senha do Linphone. Depois:
(Get-Content -Raw .\secrets\sip-1002.txt).Trim() | Set-Clipboard
# Cole na senha do MicroSIP. Ao terminar:
Set-Clipboard -Value ''
```

Teste automatizado de sinalização, com os softphones desconectados:

```powershell
python scripts/test-sip-local.py
```

A sonda testa Digest/registro, senha incorreta, autochamadas e destino local
inexistente. Remove os próprios contatos ao final; não testa áudio nem atendimento.
Não execute durante as chamadas manuais. O teste desliga o logger SIP para não
registrar material de autenticação. Reabra o logger somente ao fazer o exercício.

## Fase 2 — AMI e API local

**Fase 2:** consulte o [roteiro AMI/API](docs/PHASE2_AMI.md) para fazer a chamada
de retorno: primeiro atenda a origem, depois o destino. A API está em
`http://127.0.0.1:3000`; AMI 5038 não é publicada no host.

```powershell
Invoke-RestMethod http://127.0.0.1:3000/telephony/health
Invoke-RestMethod http://127.0.0.1:3000/extensions
$labAttempt = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/calls' -ContentType 'application/json' -Body '{"from":"1001","to":"1002"}'
Invoke-RestMethod -Uri ("http://127.0.0.1:3000/calls/" + $labAttempt.id)
```

202/`requested` significa tentativa criada; `answered` exige os dois ramais na
mesma bridge. Quedas de observação produzem `unknown`. Não há reenvio automático
de Originate. Para verificar sem telefonar: `python scripts/test-api-local.py`.
Testes da integração: `npm --prefix apps/api ci` e `npm --prefix apps/api test`.

## Desligar e limpar

```powershell
docker compose stop
docker compose ps --all
```

Para retomar: `docker compose up -d --wait --wait-timeout 60`.
O serviço não reinicia automaticamente com o Docker.

Quando quiser descartar **os dados temporários deste laboratório**, na raiz do projeto:

```powershell
docker compose down --volumes
docker compose ps --all
```

Esse comando remove o contêiner, sua rede e os volumes anônimos que a imagem
declara (sons, chaves, provisionamento, logs e spool), **e apaga o histórico
SQLite do volume `api-data` da Fase 2**. Para preservar o histórico, use somente
`docker compose stop` ou `docker compose down` sem `--volumes`. A gravação de chamadas
está desativada. Os arquivos do repositório, `secrets/` e a imagem permanecem.
O gerador não apaga nem gira senhas; preserve o conjunto local para reutilizar
os perfis dos softphones. Rotação exige atualizar os dois arquivos de senha,
`sip-auth.conf`, os clientes e reiniciar a central; não faça isso durante chamadas.
Não use `docker system prune` para limpar este projeto.

## Estado do aceite

- Fase 0: subida/CLI/ciclo de vida validados; testes confirmados pelo estudante.
- Fase 1, integração automatizada contra Asterisk real: registros 1001/1002
  com desafio 401 e resposta 200; senhas incorretas rejeitadas; autochamadas e
  destino local 9999 rejeitados com 404; contatos temporários removidos.
- Dois endpoints, dois destinos cruzados, aplicação Dial e bridge simples carregados.
  SIP/RTP publicados somente em loopback; HTTP do Asterisk e gravação desativados.
  Na Fase 2, AMI foi habilitada na rede privada e HTTP da API somente em loopback.
- Sem suíte unitária; os testes de sinalização usam UDP real pelo Windows.
- Aviso residual da ajuda interna de Stasis observado na inicialização;
  contexto e evidência registrados no roteiro de telefonia.
- Relato manual registrado em 24/10/2026: Linphone/1001 e MicroSIP/1002 registrados;
  chamadas concluídas nos dois sentidos e comunicação de áudio observada.
  `core show channels`: dois canais PJSIP, uma chamada; `bridge show all`:
  `simple_bridge` com dois canais; `pjsip show channelstats`: RTP bidirecional,
  `ulaw`, zero perdas reportadas na observação. Canais e bridge desaparecem
  após desligar. Métricas não foram discriminadas por chamada.
- Problema resolvido pelo estudante: porta SIP local do Linphone alterada para
  5062 devido ao conflito com UDP 5060 do Docker; porta do servidor mantida.
- Validação complementar informada em 24/10/2026: em 1001 → 1002, `INVITE`
  Asterisk → MicroSIP, `100 Trying`, `180 Ringing` e progresso ao Linphone,
  `200 OK` do INVITE, `ACK` nas duas pernas e entrada dos canais na bridge.
  MicroSIP enviou `BYE` ao Asterisk com resposta `200 OK`; Asterisk enviou
  `BYE` ao Linphone, também confirmado com `200 OK`; os canais saíram da bridge.
  O estudante também confirmou validação anterior da chamada inversa com
  `INVITE`, `100 Trying`, `180 Ringing`, `200 OK`, `ACK`, `BYE`, bridge e RTP.
- Fase 1 concluída: critérios satisfeitos, sem evidência manual obrigatória
  pendente. Evidências registradas apenas como resumos sanitizados dos relatos,
  sem logs brutos nem cabeçalhos de autenticação. Detalhes no
  [roteiro](docs/PHASE1_CALLS.md). Testes não foram reexecutados nesta atualização.

Fontes de escopo e sequência: [AGENTS.md](AGENTS.md),
[especificação](docs/PROJECT_SPEC.md) e [plano](docs/IMPLEMENTATION_PLAN.md).
Fase 2 concluída: AMI/API implementadas, 14 testes automatizados e verificações reais de
consulta/conexão e HTTP aprovados. Chamada 1001 → 1002 pela API confirmada pelo
estudante com áudio bidirecional e desligamento normal. O histórico conferido
contém 17 eventos sanitizados, dois canais na mesma bridge, encerramento `ended`
e 75166 ms de conversa sustentados pelos timestamps AMI. A tentativa com origem
desregistrada apresentou `queued=true`, depois `OriginateResponse: Failure`,
estado `failed`, `answeredAt=null` e `durationMs=null`. O estudante reativou 1001;
ambos os ramais voltaram a apresentar contato conhecido na consulta à API.
Critérios satisfeitos, sem pendência manual obrigatória; evidências sanitizadas
em [PHASE2_AMI.md](docs/PHASE2_AMI.md). Nenhum log bruto ou segredo foi acrescentado.
O histórico usa SQLite nativo do Node 24 fixado, sem ORM, por ser uma persistência
pequena de apoio ao estudo. Fase 3 não iniciada.
Não foram executados comandos AWS/Terraform.
