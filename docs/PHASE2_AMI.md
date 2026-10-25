# Fase 2 — AMI e API local

**Estado em 24/10/2026: Fase 2 concluída.** Consultas AMI reais, HTTP e
14 testes automatizados aprovados. Chamada 1001 → 1002 pela API confirmada pelo
estudante com áudio bidirecional e encerramento normal; histórico AMI conferido
em consulta à API. Falha real com origem desconectada também validada, sem
atendimento ou duração fictícios. Critérios de aceitação satisfeitos; Fase 3 não iniciada.

## 1. Subir e consultar antes de chamar

No PowerShell, na raiz do projeto, com Docker Desktop ligado:

```powershell
python scripts/init-sip-secrets.py
python scripts/init-ami-secret.py
docker compose up -d --build --wait --wait-timeout 120
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/telephony/health
Invoke-RestMethod http://127.0.0.1:3000/extensions
```

O gerador AMI preserva a senha existente e valida que ela seja diferente das
senhas SIP. Não exibe valores; os dois arquivos estão em `secrets/`, ignorado
pelo Git. O Asterisk recebe somente `ami-user.conf`; a API recebe somente
`ami-password.txt`, ambos para leitura. Nenhum segredo está na imagem ou no
ambiente do contêiner. No Windows, vale a ACL herdada da pasta do usuário.

`/health` mede a vida da API; `/telephony/health` mostra a sessão AMI autenticada
e o último Pong. A API pode estar saudável com AMI desconectada. O heartbeat
ocorre a cada 10 s e as ações têm timeout de 5 s; a detecção de queda não é instantânea.
Em `/extensions`, `state` é o DeviceState informado pelo Asterisk, acompanhado
do horário da consulta. `contactKnown` indica contato conhecido, não áudio ou
atendimento. Sem uma consulta confiável, o estado é `unknown`, sem snapshot antigo.

## 2. Rede e permissões

```text
Windows/softphones -- SIP/RTP em loopback --> Asterisk
Windows/PowerShell -- 127.0.0.1:3000 -------> API
                                              |
                         rede control interna |
API 172.29.88.3 -- TCP 5038 --> Asterisk 172.29.88.2
```

A rede `control` é interna, com faixa local 172.29.88.0/29. O AMI escuta somente
em 172.29.88.2; a ACL da conta permite somente 172.29.88.3. Não há publicação
de 5038. A API e o Asterisk também participam da bridge padrão **deste projeto**
para o encaminhamento de HTTP/SIP/RTP publicado no Windows. Somente loopback
é publicado. Essa faixa fixa foi conferida neste ambiente; em outra máquina,
confira sobreposição antes de alterar conjuntamente Compose, bind e ACL.

Problema real encontrado: a API respondeu dentro do contêiner na rede interna,
mas o Docker Desktop não publicou HTTP no Windows quando ela tinha apenas essa
rede. Adicionar a API à bridge padrão do projeto resolveu o acesso; AMI continuou
na interface privada. Não houve alteração de firewall ou abertura pública.

A conta usa `read=system,call` e `write=system,originate`. A classe `system` de
escrita é exigida por `PJSIPShowEndpoints` no código do Asterisk 22.11.0;
permissões AMI são por classe, não uma lista exata das ações da API. Essa classe
autoriza mais consultas/ações que a integração usa: a credencial deve permanecer
restrita ao backend privado. Não foi concedido `all`, `command` ou `config`.
`Command` foi recusado no teste real. Há filtros de eventos na conta e uma
lista explícita de ações no cliente; o HTTP não aceita ações AMI arbitrárias.

AMI é controle e eventos em TCP; não transporta voz. A mídia continua entre
softphones e Asterisk via RTP. HTTP local não habilita ARI nem AMI por HTTP.

## 3. Exercício AMI sem framework

Antes da API, foi usada uma sonda Node sem dependências para autenticar,
enviar Ping e receber `EndpointList`/`EndpointListComplete`. Com a API rodando,
reproduza a sonda a partir do mesmo endereço privado autorizado:

```powershell
docker compose exec -T api node /tools/ami-probe.mjs
```

Ela imprime somente sucesso, ramais e DeviceState; não imprime Login, Secret
nem frames completos. Cada ação usa `ActionID` próprio. Consultas de lista
precisam aguardar o evento de conclusão correspondente, não só `Response: Success`.
Uma segunda sessão de diagnóstico não interfere na sessão persistente da API.

No desenvolvimento também foi testado o bloqueio de senha AMI errada e a
reconexão de uma sessão isolada ao Asterisk real, seguida por novo Ping/Pong.
Isso não equivale a uma chamada acompanhada enquanto a conexão principal cai.

## 4. Originate pela API: atender primeiro a origem

Mantenha Linphone/1001 e MicroSIP/1002 registrados como na Fase 1, sem outra
chamada ativa. O conflito UDP do Linphone permanece resolvido por porta local
5062; o servidor continua em 127.0.0.1:5060.

```powershell
$labAttempt = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/calls' -ContentType 'application/json' -Body '{"from":"1001","to":"1002"}'
$labAttempt
Invoke-RestMethod -Uri ("http://127.0.0.1:3000/calls/" + $labAttempt.id)
```

Primeiro toca 1001. Atenda no Linphone; somente então o dialplan `from-1001`
chama 1002. Atenda o MicroSIP, confira áudio nos dois sentidos e desligue.
A origem recebe uma chamada de retorno identificada como MiniPBX; a chamada
não começa por discagem manual no softphone.

O servidor monta `Channel=PJSIP/1001`, `Context=from-1001`, `Exten=1002`,
`Priority=1`, `Async=true`, timeout inicial de 30 s e codecs G.711. O dialplan
mantém seu timeout de 30 s e ignora redirecionamentos. Na chamada inversa,
somente os dois ramais e seu contexto correspondente se invertem.
Não são aceitos `Application`, `Data`, `Channel`, `Context` ou destino arbitrário
no JSON. Campos extras são recusados. Não há troncos nem rotas externas.

O HTTP retorna **202, ID e `requested`**. A tentativa pode falhar logo depois;
consulte o ID para conhecer o resultado. `queued=true` significa que a ação foi
aceita na fila AMI, sem confirmar atendimento ou conversa. A API nunca reenvia
um Originate automaticamente após timeout ou reconexão.

```powershell
Invoke-RestMethod http://127.0.0.1:3000/calls
Invoke-RestMethod -Uri ("http://127.0.0.1:3000/calls/" + $labAttempt.id) | ConvertTo-Json -Depth 6
```

O detalhe contém apenas eventos com campos permitidos. Para observar a central:

```text
core show channels
bridge show all
pjsip show channelstats
manager show connected
```

Não é necessário habilitar logger SIP ou debug AMI para esse teste.

## 5. Como os eventos sustentam o histórico

| Sinal | Interpretação na API |
|---|---|
| HTTP aceito / resposta imediata da ação | Tentativa `requested`, com confirmação de fila separada |
| `Newstate` Ring/Ringing | Toque observado; estado `ringing` enquanto não há conversa confirmada |
| `DialBegin` | Ajuda a correlacionar o segundo canal; sozinho não confirma toque |
| `Newstate` Up do primeiro ramal | Só a origem atendeu; não confirma conversa |
| `OriginateResponse` Success | Resultado da primeira originação; não confirma os dois ramais na bridge |
| `BridgeEnter` dos dois ramais na mesma bridge | `answered` |
| `BridgeLeave` | Termina o intervalo comum de mídia observado |
| `Hangup` do canal da origem | `ended` se houve conversa confirmada; senão `failed` |
| `OriginateResponse` Failure / rejeição explícita | `failed`, sem atendimento inventado |
| Queda AMI, timeout incerto ou reinício da API | `unknown`; duração indisponível |

`ActionID` correlaciona ação e resposta. O Originate atribui `ChannelId` ao canal
inicial; ele aparece separadamente como `requestedChannelId`, mesmo se a
originação não criar canal. As listas `uniqueids` e `linkedids` só recebem
valores vistos em eventos AMI; a API acompanha também `DestUniqueid`.
Os dois membros precisam ser observados na mesma bridge. Eventos de chamadas
manuais sem correlação não são importados para o histórico das tentativas da API.

`answeredAt` exige evidência da bridge. `durationMs`, quando disponível após o
encerramento, mede os intervalos comuns entre os participantes a partir dos
timestamps AMI do mesmo Asterisk. Não mede tempo desde o HTTP nem desde o
primeiro ramal atendido. Timestamp ausente/regressivo, lacuna de observação ou
truncamento de evidências deixa duração nula. Não é um CDR de faturamento.

O parser trata fragmentação e múltiplos frames TCP. Também distingue um evento
`OriginateResponse`, que possui campo Response, da resposta imediata da ação.
Reconexão usa espera progressiva de 0,5 s até 10 s e nova autenticação.
Tentativas antigas com lacunas permanecem `unknown`, sem reconstrução fictícia.

## 6. Persistência, testes e falhas

SQLite usa o módulo nativo do Node 24.15.0 fixado, sem adicionar ORM: a persistência
é pequena e não é tema de estudo. O arquivo `/data/calls.sqlite` fica no volume
`api-data`. Guardam-se as últimas 100 tentativas, com até 120 evidências por
tentativa e campos limitados; registros antigos são removidos por retenção.
Nenhuma gravação de áudio, CDR em arquivo ou pacote SIP bruto é armazenado.

Uma tentativa ativa encontrada após reinício da API vira `unknown`. O histórico
continua consultável. Antes de criar nova chamada, a API consulta canais reais
do Asterisk, evitando sobrepor uma ligação cujo acompanhamento foi perdido.
O laboratório aceita só uma tentativa ativa por vez; conflito retorna 409.

```powershell
npm --prefix apps/api ci --no-audit --no-fund
npm --prefix apps/api test
python scripts/test-api-local.py
```

O primeiro comando só é necessário para testes no host; o build Docker executa
os testes também. São 14 testes de parser/AMI simulada, correlação, ausência de
atendimento prematuro, duração, interrupção, validação e SQLite. A sonda HTTP
real verifica saúde, ramais e recusas 400/403/404 sem disparar chamadas.

Testes manuais de falha, somente depois de encerrar a chamada corrente:

1. Desconecte o ramal de origem no cliente e confira que não há contato. Faça
   nova tentativa pela API. A aceitação inicial pode ser seguida de `failed`;
   conferir `OriginateResponse`/Hangup no detalhe. Reconecte o cliente depois.
2. Com origem registrada e destino desconectado, atenda a primeira perna e
   confira a falha do destino, sem `answered` nem duração de conversa.
3. Sem chamada ativa, opcionalmente pare **somente o Asterisk deste projeto**.
   A API deve permanecer viva, indicar AMI desconectada, devolver ramais
   `unknown` e recusar novo POST com 503. Ao subir o Asterisk, aguarde a nova
   sessão AMI e o novo registro dos softphones.
4. Para observar uma lacuna durante chamada, só interrompa após combinar esse
   exercício: o áudio e o histórico podem sofrer efeitos diferentes. Não
   executar a interrupção enquanto outra pessoa valida a chamada normal.

Após falhas não reenviar cegamente: consultar ID e canais antes de tentar de novo.

## 7. Evidências e aceite

Verificado em 24/10/2026:

- Conta AMI autenticada em rede privada; Ping/Pong; consultas reais de ramais e
  canais com listas correlacionadas. Comando de CLI recusado; senha errada rejeitada.
- Reconexão e novo Ping em sessão de diagnóstico separada, sem Originate.
- API acessível pelo Windows somente em loopback; 5038 não publicada.
- 14 testes automatizados aprovados no build Docker e teste HTTP local aprovado.
- Problema de publicação HTTP em rede apenas interna diagnosticado e resolvido.

### Chamada real pela API — 24/10/2026

O estudante confirmou chamada completada, áudio nos dois sentidos e desligamento
normal após executar o POST 1001 → 1002. O agente consultou `GET /calls` e o
detalhe sanitizado da tentativa, sem originar nova chamada, ler logs brutos ou
acessar arquivos de senhas nesta conferência.

| Evidência | Resultado |
|---|---|
| ID da tentativa e `ActionID` | `87039f1d-2054-490d-8eb6-d537fbbd2de4` |
| Origem/destino | 1001 → 1002 |
| Aceitação na fila | `queued=true` |
| Atendimento inicial | `Newstate: Up` de 1001, seguido por `OriginateResponse: Success` |
| Correlação | Dois `Uniqueid` observados, com `Linkedid` comum ao canal inicial atribuído pelo Originate |
| Conversa confirmada | `BridgeEnter` de 1002 e de 1001 na mesma bridge, com dois participantes |
| Áudio | Bidirecional, conforme confirmação manual do estudante |
| Encerramento | Dois `BridgeLeave` e dois `Hangup`, com `Cause=16` nos eventos armazenados |
| Estado final | `ended`, sem motivo de falha |
| Duração de conversa registrada | `durationMs=75166` (75,166 s) |
| Evidências armazenadas | 17 eventos AMI sanitizados |

Os timestamps AMI permitem distinguir as etapas. Em horário de São Paulo
(UTC−3), no dia 24/10/2026, o atendimento inicial/OriginateResponse ocorreu
às 20:38:50.314; a entrada do segundo participante na bridge, às 20:38:52.429;
a primeira saída da bridge, às 20:40:07.595; e o Hangup do canal inicial,
às 20:40:07.597. A duração de 75,166 s corresponde ao intervalo comum na bridge,
arredondado para milissegundos, e não ao tempo desde o POST ou desde o primeiro
ramal atendido. Esses valores pertencem somente a esta tentativa.

`answeredAt` e os dois eventos de entrada sustentam o atendimento da conversa;
o estado final `ended` e `endedAt` são sustentados pelos eventos de encerramento.
O resultado de áudio foi informado pelo estudante, sem inferi-lo apenas de AMI.
Não foram feitas novas medições de codec, perdas ou jitter nesta atualização.

### Falha real com origem desconectada — 24/10/2026

O estudante confirmou a desativação temporária do registro de 1001 no Linphone,
a nova tentativa 1001 → 1002 pela API e o resultado `failed`, sem atendimento
ou duração de conversa. Informou também ter reativado 1001 ao terminar.
O agente conferiu o resultado pelo histórico sanitizado, sem nova chamada.

| Evidência | Resultado |
|---|---|
| ID da tentativa e `ActionID` | `8f8d348b-9039-40e0-89d6-078c849b81a7` |
| Origem/destino | 1001 → 1002, com origem desregistrada no teste manual |
| Aceitação inicial | `queued=true` |
| Evento correlacionado | `OriginateResponse`, `Response=Failure`, `Reason=0` |
| Estado/motivo armazenados | `failed`, `originate_reason_0` |
| Atendimento | `answeredAt=null` |
| Duração de conversa | `durationMs=null` |
| Encerramento por Hangup | `endedAt=null`; não há evento Hangup nessa tentativa |
| Evidência armazenada | Um evento AMI sanitizado; nenhum `Newchannel` ou `BridgeEnter` registrado |
| Restauração | Estudante reativou 1001; consulta posterior de `/extensions` mostrou ambos com `contactKnown=true` e `state=Not in use` |

O código `Reason=0` foi registrado sem atribuir a ele, isoladamente, uma causa
mais específica. A ausência do registro é o contexto informado pelo estudante.
O `Uniqueid` presente na resposta não foi usado como prova de criação de canal
ou atendimento. Também não foi inventado horário de Hangup onde esse evento não
foi recebido. O contraste entre `queued=true` e `failed` demonstra que aceitar
Originate na fila não significa completar a chamada.

### Situação do aceite

| Verificação | Estado |
|---|---|
| Chamada 1001 → 1002 pela API | Confirmada pelo estudante e pela tentativa registrada |
| Dois ramais na bridge, atendimento registrado e áudio nos dois sentidos | Confirmados por `BridgeEnter`/`answeredAt` e pelo relato de áudio |
| Hangup, `ended`, evidências correlacionadas e duração coerente/nula justificada | Confirmados no histórico sanitizado; duração de 75166 ms sustentada pelos timestamps |
| Falha real com ramal desconectado, sem atendimento fictício | Confirmada pelo estudante e pelo `OriginateResponse: Failure`; `failed`, sem `answeredAt` ou duração |

A chamada direta da Fase 1 e a chamada pela API têm evidências separadas.
A Fase 2 está concluída e marcada no plano: não há evidência manual obrigatória
pendente para esse aceite. A chamada normal e a falha com origem desconectada
foram verificadas separadamente. Os 14 testes automatizados, a reconexão real
em sessão isolada e as verificações HTTP permanecem evidências da implementação;
não foram reexecutados nesta atualização documental.

A interrupção da conexão AMI principal durante uma conversa e a falha do destino
após atendimento da origem continuam disponíveis como exercícios adicionais da
seção 6, sem serem declaradas como testes manuais executados. Não confundir a
reconexão isolada já testada com uma interrupção da sessão principal durante chamada.
Nenhuma implementação da Fase 3 foi iniciada.

## 8. Desligar, limpar e reverter

`docker compose stop` para os serviços sem apagar histórico. Para retomar, use
`docker compose up -d --wait`. `docker compose down` remove serviços/rede e
preserva o volume nomeado de SQLite. **`docker compose down --volumes` apaga
também o histórico SQLite**, além dos volumes temporários da imagem Asterisk.
Executar esse descarte apenas quando não precisar dos dados fictícios do laboratório.
Os arquivos em `secrets/` permanecem; não os remover para encerrar os contêineres.

Para reverter só a integração: `docker compose stop api`, definir `enabled=no`
em `infra/asterisk/manager.conf` e reiniciar Asterisk sem chamada ativa.
Preserve segredos e volume de histórico. Suba somente `asterisk` para continuar
as chamadas diretas da Fase 1; não é necessário desfazer os ramais SIP.

Se a rede control mudar, atualizar conjuntamente Compose, bind AMI e ACL do
arquivo de usuário, sem rotacionar ou imprimir senhas por conveniência.

## Fontes

- [AMI Originate na série 22](https://docs.asterisk.org/Asterisk_22_Documentation/API_Documentation/AMI_Actions/Originate/)
- [OriginateResponse](https://docs.asterisk.org/Asterisk_22_Documentation/API_Documentation/AMI_Events/OriginateResponse/)
- [BridgeEnter e identificação de canais](https://docs.asterisk.org/Asterisk_22_Documentation/API_Documentation/AMI_Events/BridgeEnter/)
- [Permissão de PJSIPShowEndpoints no código 22.11.0](https://github.com/asterisk/asterisk/blob/22.11.0/res/res_pjsip/pjsip_configuration.c)
- [Configuração AMI da versão usada](https://github.com/asterisk/asterisk/blob/22.11.0/configs/samples/manager.conf.sample)
