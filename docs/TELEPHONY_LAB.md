# Laboratório de telefonia — Fase 0

## Objetivo e critérios

Executar Asterisk localmente, entrar na CLI e inspecionar sua configuração.
O aceite exige o processo saudável **e** o driver PJSIP carregado.
Registro de ramais, chamadas e mídia real pertencem à Fase 1, ainda não iniciada.

## O que estamos preparando

Uma PBX é uma central que recebe e encaminha chamadas. O Asterisk fará esse
papel entre dois ramais internos, sem troncos nem ligação com a telefonia pública.
PJSIP é a pilha SIP usada pelo Asterisk; `chan_pjsip` a conecta aos canais da central.

SIP sinaliza sessões: registro (`REGISTER`), convite (`INVITE`), progresso,
atendimento (`200 OK`/`ACK`) e encerramento (`BYE`). RTP transporta a mídia
negociada, normalmente em portas UDP diferentes da sinalização. O SDP levado
no SIP anuncia endereços, portas e codecs. Um registro bem-sucedido não prova
que o endereço de mídia anunciado é alcançável.

| Objeto PJSIP | Responsabilidade | Nesta fase |
|---|---|---|
| Transport | Protocolo e endereço para SIP | UDP, porta 5060 dentro do contêiner |
| Endpoint | Perfil do telefone: codecs, contexto e referências | Nenhum |
| Auth | Credencial para autenticar o telefone | Nenhuma |
| AoR | Destino lógico ao qual os contatos se associam | Nenhum |
| Contact | URI/endereço pelo qual o telefone pode ser alcançado | Nenhum |

Na próxima fase, cada ramal terá endpoint, auth e AoR. O registro autenticado
atualizará o contato. Os codecs G.711 (`ulaw`/`alaw`) já estão disponíveis;
seleção e mídia serão verificadas nas chamadas reais.

AMI é uma interface TCP de controle e eventos para o futuro back-end.
Está desativada nesta fase. A CLI usa um socket Unix dentro do contêiner;
entrar nela não abre uma conexão AMI e não exige publicar a porta 5038.

## Rede escolhida e limites

```text
Windows: CLI docker / futuros softphones locais
       |
       +-- 127.0.0.1:5060 UDP --------> Docker Desktop/WSL2 --> Asterisk
       +-- 127.0.0.1:10000–10019 UDP -> faixa RTP preparada

AMI 5038: desativada, sem publicação
HTTP/ARI: desativado
```

Os IPs de Wi-Fi, VPN e WSL são dinâmicos e não foram fixados na configuração.
`bind = 0.0.0.0:5060` em `pjsip.conf` vale **dentro do contêiner**;
o endereço publicado pelo Compose no Windows é exclusivamente `127.0.0.1`.
RTP aloca portas quando houver mídia; não se espera ver todas as portas
da faixa como sockets ativos antes de uma chamada.

Docker Desktop adiciona encaminhamento entre Windows e sua VM Linux.
Os IPs internos do contêiner não são endereços para configurar um softphone
no Windows. O primeiro caminho a testar na Fase 1 será dois clientes no próprio
Windows, apontando para `127.0.0.1:5060`. Isso ainda não foi validado com SIP/RTP.
Um telefone na LAN não consegue usar o loopback do computador.

Se houver áudio em um só sentido ou timeout na próxima fase, observaremos
Via/Contact, SDP e origem dos pacotes antes de alterar opções de NAT como
`rewrite_contact`, `force_rport`, `rtp_symmetric`, `direct_media` e endereços externos.
Carregar `res_pjsip_nat` sozinho não resolve NAT. Não habilitamos host networking,
STUN público, encaminhamento no roteador ou regras de firewall nesta fase.

## Arquivos e decisões

| Arquivo | Função |
|---|---|
| `compose.yaml` | Imagem fixada, usuário sem root, portas locais e limites de recursos/log |
| `infra/asterisk/asterisk.conf` | Diretórios, limite de duas chamadas e opções da central |
| `infra/asterisk/modules.conf` | Lista explícita de módulos, sem módulos de gravação |
| `infra/asterisk/pjsip.conf` | Somente transporte SIP; não aceita ramais nem anônimos |
| `infra/asterisk/extensions.conf` | Contextos vazios; nenhuma discagem é encaminhada |
| `infra/asterisk/rtp.conf` | Faixa RTP pequena, igual à publicação do Compose |
| `infra/asterisk/manager.conf`, `http.conf` | Desativam AMI e servidor HTTP |
| `infra/asterisk/logger.conf` | Console; Docker limita o log a dois arquivos de 5 MB |
| `infra/asterisk/cdr.conf`, `cel.conf` | Histórico e eventos em arquivo desativados nesta fase |
| Demais `.conf` | Configuração mínima do core/PJProject, Stasis, tons e recursos não usados |
| `.gitignore`, `.env.example` | Proteção de segredos e nomes reservados para fases seguintes |

Os pequenos arquivos do core evitam erros de configuração ausente durante a
inicialização. Stasis é também um barramento interno do Asterisk; configurá-lo
não habilita ARI. O diretório de configuração está montado somente para leitura.
Alterações devem ser feitas no projeto, seguidas de `docker compose restart asterisk`.
Para alterar imagem/portas/healthcheck do Compose, use `docker compose up -d --wait`.

Nesta fase não existem segredos reais. Nas próximas, gerar senhas aleatórias
fortes e diferentes para cada ramal e para AMI, armazená-las em `secrets/`,
ignorado pelo Git, e implementar a injeção sem imprimi-las.
Copiar `.env.example` não configura os `.conf`: Asterisk não interpola essas
variáveis automaticamente. Não preencher os arquivos versionados com senhas.

## Exercício inicial: conhecer a central

Na raiz do projeto, execute os comandos de subida do [README](../README.md).
Depois entre com `docker compose exec asterisk asterisk -rv`.

| Comando dentro da CLI | O que conferir |
|---|---|
| `core show version` | Versão efetivamente executada: 22.11.0 |
| `core show uptime` | Processo disponível; isso sozinho não prova telefonia |
| `core show channeltypes` | Driver `PJSIP` registrado |
| `module show like chan_pjsip` | Módulo com estado `Running` |
| `pjsip show transports` | Um transporte UDP em `0.0.0.0:5060` dentro do contêiner |
| `pjsip show endpoints` | `No objects found.` é esperado nesta fase |
| `pjsip show contacts` | Nenhum contato registrado |
| `dialplan show` | Zero extensões, contextos `default` e `internal` |
| `rtp show settings` | Portas 10000 a 10019, Strict RTP ativo |
| `manager show settings` | `Manager (AMI): No`, bind TCP desativado |
| `http show status` | `Server Disabled` |
| `exit` | Sair da CLI, mantendo Asterisk ativo |

Na Fase 0 não há tráfego de chamadas para capturar. Depois de configurar ramais,
`pjsip set logger on` e `rtp set debug on` permitirão observar SIP e RTP na CLI.
Ao terminar, desligar com `pjsip set logger off` e `rtp set debug off`.
Sinalização pode conter dados de autenticação e identificação; não publicar
capturas completas nem habilitar debug permanentemente. Não imprimir senhas.

## Diagnóstico e reversão

| Sintoma | Como verificar | Correção local |
|---|---|---|
| Pipe `dockerDesktopLinuxEngine` ausente | `docker version` mostra cliente, mas falha no servidor | `docker desktop start`; repetir `docker version` |
| Porta já ocupada | `Get-NetUDPEndpoint -LocalPort 5060` no PowerShell | Identificar o processo; não matar serviços sem conferir; parar só o laboratório se necessário |
| `unhealthy` ou módulo `Not Running` | `docker compose logs --tail 100 asterisk`; `module show like pjsip` | Conferir dependências na versão usada; corrigir módulos e reiniciar |
| Endpoint/contato ausente | `pjsip show endpoints` / `pjsip show contacts` | Normal na Fase 0; não há contas configuradas |
| Configuração editada não aparece | CLI e logs após reinício | Editar o arquivo montado no projeto e reiniciar o serviço |
| Sem áudio | Ainda não existe chamada nesta fase | Na Fase 1, conferir SDP, codec, RTP e NAT separadamente do registro |

Problema real encontrado na preparação: `chan_pjsip` recusou carregar por falta de
`res_pjsip_pubsub`. A CLI funcionava, mas o driver de telefonia não estava ativo.
Incluímos a dependência e trocamos o healthcheck, antes baseado em uptime,
por uma consulta que exige `PJSIP` em `core show channeltypes`.

Aviso residual observado na versão 22.11.0: `Could not find option
'minimum_size' with type 'threadpool' in module 'stasis'`, antes do logger.
O [código dessa versão](https://github.com/asterisk/asterisk/blob/22.11.0/main/stasis.c)
registra a opção para os tipos `threadpool` e `taskpool`, enquanto sua documentação
interna descreve `minimum_size` apenas para `taskpool`. Isso sugere uma
inconsistência da ajuda interna. Nosso arquivo usa `[taskpool]`, conforme o
exemplo oficial; a inicialização prossegue até `Asterisk Ready` com PJSIP ativo.
O aviso foi mantido visível e não foi tratado como prova de falha de SIP/RTP.

Para reverter uma alteração, restaurar o conteúdo anterior do arquivo e
reiniciar o serviço. Para desligar: `docker compose stop`. Para descartar
contêiner/rede/volumes temporários: `docker compose down --volumes`, conforme
o aviso de dados no README. Não alterar o firewall global nem limpar outros projetos.

## Evidências e pendências — 23/10/2026

Verificações de integração local por comandos, sem testes unitários:

- Imagem baixada e manifesto fixado pelo digest em `compose.yaml`.
- Asterisk 22.11.0 inicializa; `chan_pjsip.so` está `Running`; serviço saudável.
- Transporte UDP 5060, faixa RTP 10000–10019, zero endpoints/contatos/extensões.
- AMI e HTTP desativados; sockets TCP sem listener AMI; binds publicados
  inspecionados exclusivamente em 127.0.0.1; usuário do processo `asterisk`.
- Parada e retomada locais testadas; comandos de CLI respondem após a retomada.
- Console interativa aberta com `asterisk -rv`; `core show version` executado;
  saída com `exit`, preservando o serviço ativo.

Pendentes, **manuais**, para a Fase 1: dois softphones locais, permissões de
microfone, registro autenticado, chamadas nos dois sentidos, áudio bidirecional,
bridge e hangup. Sugestão: [Linphone](https://www.linphone.org/en/download/) e
[MicroSIP para Windows](https://www.microsip.org/downloads), usando contas do
Asterisk local; não criar conta em provedor SIP público. Nenhum softphone foi
instalado automaticamente, e nenhuma chamada ou entrega de mídia foi validada.

## Referências

- [Versões do Asterisk](https://www.asterisk.org/downloads/asterisk/all-asterisk-versions/)
- [Relacionamentos PJSIP: endpoint, auth, AoR e contact](https://docs.asterisk.org/Configuration/Channel-Drivers/SIP/Configuring-res_pjsip/PJSIP-Configuration-Sections-and-Relationships/)
- [Exemplos de configuração da versão 22.11.0](https://github.com/asterisk/asterisk/tree/22.11.0/configs/samples)
- [Rede no Docker Desktop](https://docs.docker.com/desktop/features/networking/)
- [Origem da imagem comunitária](https://github.com/andrius/asterisk)
