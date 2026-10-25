# Fase 1 — chamadas entre 1001 e 1002

**Estado em 24/10/2026: Fase 1 concluída.** Chamadas nos dois sentidos, áudio,
RTP, bridge, fluxo SIP e encerramento validados conforme os relatos manuais do
estudante, incluindo a validação complementar da sinalização. Critérios de
aceitação satisfeitos; nenhuma evidência manual obrigatória restante nesta fase.
Validação da Fase 2 iniciada em solicitação posterior; ver [PHASE2_AMI.md](PHASE2_AMI.md).
Nenhuma etapa AWS iniciada.

## 1. Preparar a central

No PowerShell, na raiz do projeto:

```powershell
python scripts/init-sip-secrets.py
docker compose config --quiet
docker compose up -d --wait --wait-timeout 60
docker compose exec asterisk asterisk -rv
```

O gerador cria duas senhas aleatórias distintas (32 bytes cada) e os objetos auth
em `secrets/sip-auth.conf`. Os arquivos `sip-1001.txt` e `sip-1002.txt` servem para
preencher os clientes; só o `.conf` é montado no contêiner, somente para leitura.
Reexecutar o gerador valida e preserva as senhas; um conjunto parcial é recusado.
Se faltar o segredo, o Compose recusa a montagem; não há fallback com senha fraca.
No Linux, arquivos são criados com modo 600; no Windows, usam a ACL herdada da
pasta do usuário. Mantenha `secrets/` privado e fora de pastas compartilhadas.

Confira na CLI:

```text
pjsip show endpoints
pjsip show aors
pjsip show contacts
dialplan show from-1001
dialplan show from-1002
bridge technology show
```

Antes dos clientes: dois endpoints com auth/AoR, mas sem contatos (`Unavailable`).
O registro `REGISTER` autentica o cliente e associa um contato ao AoR.
`qualify_frequency=30` verifica alcance por `OPTIONS`; `Avail` indica resposta
à verificação, sem garantir áudio, microfone ou atendimento.

## 2. Configurar Linphone e MicroSIP no mesmo Windows

Se ainda não estiverem instalados, use [Linphone](https://www.linphone.org/en/download/)
e [MicroSIP](https://www.microsip.org/downloads). Utilize uma **conta SIP existente
da central local**; não crie conta em provedor público nem adicione troncos.
Os rótulos dos campos variam entre versões. Configure:

| Campo | Linphone | MicroSIP |
|---|---|---|
| Ramal / usuário | 1001 | 1002 |
| Nome de autenticação / Login | 1001 | 1002 |
| Endereço SIP | `sip:1001@127.0.0.1` | `sip:1002@127.0.0.1` |
| Domínio | `127.0.0.1` | `127.0.0.1` |
| Servidor / registrar | `sip:127.0.0.1:5060;transport=udp` | SIP Server: `127.0.0.1:5060` |
| Proxy de saída | mesmo servidor local, se exigido pela UI | vazio |
| Transporte | UDP | UDP |
| Senha | conteúdo de `secrets/sip-1001.txt` | conteúdo de `secrets/sip-1002.txt` |
| Registro | habilitado | habilitado |
| Criptografia de mídia | nenhuma / RTP no laboratório local | SRTP desativado |
| ICE/STUN/TURN | desativados | desativados |
| Codecs de áudio | PCMU/G.711 µ-law e PCMA/G.711 A-law | PCMU e PCMA |

Não selecione TLS/TCP ou ZRTP/SRTP obrigatório: esse perfil só oferece SIP/UDP
e RTP no loopback. Desative vídeo, encaminhamento e atendimento automático.
Escolha microfone e saída corretos, concedendo permissão de microfone no Windows.

A porta **do servidor** é 5060. As portas **locais dos clientes** precisam ser
distintas entre si e da porta publicada pela central. Se houver conflito de
bind, configure uma porta local livre (ex.: 5062 no Linphone e 5064 no MicroSIP)
nas opções avançadas; mantenha o servidor em 5060.

**Solução efetivamente testada pelo estudante:** houve conflito de UDP 5060 entre
Linphone e Docker. Alterar a porta SIP **local do Linphone para 5062** resolveu
o conflito, permitindo registro e chamadas. A porta do servidor permaneceu 5060.
A porta local utilizada pelo MicroSIP não foi informada; 5064 acima é somente
uma sugestão para eventual conflito, não uma configuração comprovada.

Copie as senhas sem exibi-las no terminal ou no chat:

```powershell
(Get-Content -Raw .\secrets\sip-1001.txt).Trim() | Set-Clipboard
# Colar no Linphone. Depois:
(Get-Content -Raw .\secrets\sip-1002.txt).Trim() | Set-Clipboard
# Colar no MicroSIP. Ao terminar:
Set-Clipboard -Value ''
```

Registre os dois e confira `pjsip show contacts`. Cada AoR aceita um contato;
novo registro autenticado pode substituir o anterior. Não use o mesmo ramal
nos dois aplicativos. Um contato pode aparecer com IP do gateway Docker,
pois `rewrite_contact=yes` usa a origem recebida pelo Asterisk.

## 3. Entender dialplan e NAT

| Peça | Comportamento e motivo |
|---|---|
| Contexto `from-1001` | Apenas a extensão literal 1002 executa `Dial(PJSIP/1002,30,i)` |
| Contexto `from-1002` | Apenas a extensão literal 1001 executa `Dial(PJSIP/1001,30,i)` |
| `default` | Vazio; sem acesso a rotas |
| Opção `i` de Dial | Ignora encaminhamento sugerido pelo chamado |
| `allow_transfer=no` | Não permite transferência SIP |
| `direct_media=no` | Mantém os dois fluxos RTP passando pelo Asterisk |
| `media_address=127.0.0.1` | Anuncia no SDP o endereço acessível aos clientes no mesmo Windows |
| `external_signaling_address/port` | Anuncia o acesso local da central no SIP quando há tradução |
| `rewrite_contact=yes` | Usa origem real do pacote para alcançar o cliente |
| `force_rport=yes` | Responde à porta de origem da sinalização |
| `rtp_symmetric=yes` | Envia RTP à origem da mídia recebida |
| Faixa 10000–10019 | Portas UDP publicadas em loopback para mídia da central |

Não existe dialstring fornecida pelo usuário: os dois destinos são fixos no
arquivo. Não há padrões `_X.`, includes de exemplos ou troncos. Autochamadas e
outros números são rejeitados antes de executar Dial. O contexto depende do
endpoint autenticado, não de um destino passado por uma API.

Este perfil é específico de **dois aplicativos no mesmo Windows**. Não serve
para celular na LAN nem cliente dentro de outro contêiner: `127.0.0.1` aponta
para a própria máquina de quem interpreta o SDP. A sinalização passou na sonda;
RTP bidirecional foi relatado nos testes manuais descritos na seção 6.
Não ampliar binds ou desligar o
firewall para tentar corrigir áudio.

## 4. Fazer as duas chamadas e observar evidências

Abra a CLI com `docker compose exec asterisk asterisk -rv`. Habilite o logger
apenas durante o exercício:

```text
pjsip set logger on
rtp set debug on
```

SIP pode conter cabeçalhos Digest de autenticação e identificação. Observe
localmente; não publique a captura completa nem arquivos de senhas. Os logs do
Docker têm rotação limitada, mas debug deve ser desligado ao terminar.

1. No Linphone (1001), disque **1002**; se pedir URI, `sip:1002@127.0.0.1`.
2. Observe o MicroSIP tocar; atenda. Fale e verifique recepção nos dois lados.
   No mesmo computador, ambos podem captar o mesmo microfone: confira o
   medidor/estatísticas de recepção de cada app e selecione saídas adequadas;
   use fones e mute um microfone por vez para evitar realimentação.
3. Enquanto a chamada estiver ativa, execute na CLI:

   ```text
   core show channels
   bridge show all
   pjsip show channelstats
   ```

4. Deve haver dois canais PJSIP em uma bridge. Nos logs, relacione o `INVITE`,
   `180 Ringing` (ou progresso equivalente), `200 OK` do INVITE, `ACK` e entrada
   na bridge. Há duas pernas SIP, com Call-IDs próprios: o Asterisk é uma PBX
   que termina e cria sessões, não um simples encaminhador de mensagens.
5. Identifique no SDP o endereço da mídia da central e as portas da faixa.
   Compare linhas de RTP recebidas/enviadas e contadores RX/TX. Isso evidencia
   pacotes; só a audição confirma voz inteligível e caminho de microfone/saída.
6. Desligue no MicroSIP. Observe `BYE` e sua resposta; confirme zero canais e
   nenhuma bridge ativa com os comandos acima.
7. Repita **1002 → 1001**, agora desligando no Linphone. Registre o resultado
   separadamente. Evite outra chamada simultânea: o laboratório limita chamadas.

Ao terminar:

```text
pjsip set logger off
rtp set debug off
exit
```

Fluxo simplificado de referência; as mensagens confirmadas pelo estudante estão
discriminadas na seção 6, sem reprodução de logs brutos:

```text
1001           Asterisk              1002
 INVITE -------> | ---- INVITE -------> |
 <--- progresso | <--- progresso ----- |
 <------ 200 OK | <------ 200 OK ------ |
 ACK ---------> | -------- ACK ------> |
 RTP <========> | <======== RTP =====> |
 <---- BYE ---- | <------- BYE -------- |  (exemplo: 1002 desliga)
 ---- 200 ----> | -------- 200 ------> |
```

O `200 OK` de REGISTER é registro; o `200 OK` de INVITE é aceite da sessão.
Eles não devem ser confundidos. `ACK` e bridge ajudam a confirmar a chamada;
qualidade e áudio bidirecional ainda dependem de observação da mídia.

## 5. Falha reproduzível e teste automatizado

Com os clientes desconectados e sem contatos na CLI:

```powershell
python scripts/test-sip-local.py
```

A sonda usa a biblioteca padrão Python, com UDP real para `127.0.0.1:5060`.
Para cada ramal, testa senha aleatória incorreta (rejeição), depois senha correta
(`401` → Digest → `200 OK`), e INVITEs autenticados para a própria extensão e
para `9999` **na central local** (ambos `404`). Não há contato com PSTN/provedor.
Ela recusa executar se já houver contatos, desliga o logger SIP e remove seus
contatos com `REGISTER`/Expires 0 ao terminar. Não substitui teste de áudio.
Se interrompida à força, aguarde os contatos temporários expirarem (120 s).

Essa falha simulada mostra que um primeiro `401 Unauthorized` é normal: trata-se
do desafio Digest. Repetir 401/403 **depois de enviar a autenticação** aponta
para credencial/usuário incorreto; um timeout sem resposta sugere transporte,
porta ou processo. Corrigir a senha local do cliente e registrar novamente;
não enfraquecer a autenticação da central.

| Sintoma | Investigar |
|---|---|
| Nenhum pacote SIP chega | Servidor 127.0.0.1:5060, UDP, Docker saudável, conflito de porta local |
| Registro não termina | Usuário/Login, domínio e senha do arquivo correspondente; distinguir desafio de falha |
| Contato `Unavailable` | Resposta a OPTIONS, app aberto, renovação de registro e origem após NAT |
| Chamada rejeitada com 404 | Número e contexto; só o outro ramal existe |
| `CHANUNAVAIL` / erro de contato | Outro cliente registrado? Conferir `pjsip show contacts` |
| `488 Not Acceptable Here` | PCMU/PCMA habilitados e criptografia obrigatória desativada |
| Chama, mas não há áudio | SDP, endereço/porta, RX/TX RTP, ICE/STUN, mute, permissão e dispositivo de áudio |
| Chamada cai perto de 60 s sem mídia | `rtp_timeout=60`; investigar ausência de RTP |
| Chamada atendida continua retransmitindo 200 | Investigar ACK e Contact/Via, separadamente da mídia |

## 6. Evidências, operação e reversão

Verificado automaticamente em 23/10/2026: subida saudável, dois endpoints e
dois destinos cruzados, Digest/registro real dos dois ramais pelo Windows,
senha errada rejeitada, 404 para destinos proibidos e remoção dos contatos.
O gerador e a sonda não imprimiram senhas. Naquela preparação, AMI/HTTP e
gravação estavam desativados; a ativação posterior da AMI pertence à Fase 2.
Esses resultados automatizados são da preparação de 23/10/2026;
não foram reexecutados nesta atualização documental.

### Evidências manuais registradas em 24/10/2026

Fonte: relatos do estudante sobre a execução manual e a validação complementar
dos logs SIP. As evidências abaixo são resumos sanitizados; não reproduzem logs
brutos, cabeçalhos de autenticação ou segredos. Não houve nova execução da
central pelo agente para produzir essas evidências.

| Verificação | Evidência relatada |
|---|---|
| Clientes registrados | Linphone como 1001; MicroSIP como 1002 |
| Chamadas internas | 1001 → 1002 e 1002 → 1001 realizadas com sucesso |
| Áudio | Comunicação de áudio observada durante os testes |
| `core show channels` | Dois canais PJSIP ativos, uma chamada |
| `bridge show all` | Uma bridge `simple_bridge` com dois canais |
| `pjsip show channelstats` | RTP nos dois sentidos, codec `ulaw`, zero perdas reportadas |
| Encerramento | Canais e bridge desaparecem após desligar |

### Validação complementar do fluxo SIP — 24/10/2026

Na chamada **1001 → 1002**, o estudante confirmou a seguinte sequência:

| Etapa | Evidência manual relatada |
|---|---|
| Convite | `INVITE` enviado pelo Asterisk ao MicroSIP/1002 |
| Processamento | `100 Trying` recebido |
| Toque | `180 Ringing` recebido do MicroSIP e progresso enviado ao Linphone |
| Atendimento | `200 OK` do INVITE recebido |
| Confirmação | `ACK` observado nas duas pernas SIP |
| Conexão | Ambos os canais PJSIP ingressaram na `simple_bridge` |
| Encerramento pela parte chamada | MicroSIP enviou `BYE` ao Asterisk, que respondeu `200 OK` |
| Encerramento da outra perna | Asterisk enviou `BYE` ao Linphone, que confirmou com `200 OK` |
| Liberação | Ambos os canais saíram da bridge após o encerramento |

Para **1002 → 1001**, o estudante confirmou validação anterior de `INVITE`,
`100 Trying`, `180 Ringing`, `200 OK`, `ACK`, `BYE`, bridge e RTP. Não foram
detalhados o emissor do BYE ou as respostas de encerramento dessa chamada;
os detalhes acima sobre esses pontos pertencem apenas à chamada 1001 → 1002.

As estatísticas RTP verificadas anteriormente mostraram comunicação bidirecional
com G.711 μ-law (`ulaw`) e zero perdas reportadas. Essa evidência de mídia é
distinta da confirmação de sinalização SIP e da presença dos canais na bridge.

As métricas foram relatadas para o conjunto dos testes, sem amostras separadas
para cada sentido de discagem. Zero perdas se refere à observação reportada;
não representa garantia para outras chamadas ou condições de rede. Não foram
informadas durações, jitter, latência ou endereços/portas vistos em SDP.

**Problema real resolvido:** conflito da porta SIP UDP 5060 entre Linphone e
Docker. A porta local do Linphone foi alterada para 5062; a porta da central
continuou 5060. A distinção é entre a porta em que o cliente escuta e o endereço
do servidor ao qual ele se registra. Não foi relatada alteração de firewall,
exposição à LAN ou migração para outro ambiente.

### Revisão dos critérios de aceitação

| Critério | Situação |
|---|---|
| Dois ramais internos com autenticação e dialplan restrito | Implementado e validado na preparação automatizada |
| Registro dos dois softphones | Confirmado pelo relato manual |
| Chamadas em ambos os sentidos, áudio e RTP | Resultado funcional validado pelo relato; RTP bidirecional observado |
| Bridge e encerramento | Confirmados pelos comandos relatados |
| Falha e correção documentadas | Conflito UDP 5060 resolvido com porta local 5062; falha de autenticação também testada pela sonda |
| Fluxo SIP de chamada observado em logs | Confirmado pelo relato complementar para 1001 → 1002 e pela confirmação de validação anterior para 1002 → 1001 |

**Conclusão do aceite:** todos os critérios da Fase 1 estão satisfeitos com base
na preparação automatizada e nos relatos manuais. Não há evidência manual
obrigatória pendente para encerrar esta fase. A observação manual do fluxo
`REGISTER`/Digest não foi declarada; o registro dos aplicativos foi confirmado
e esse fluxo foi verificado pela sonda, em teste separado.

O aprendizado demonstrado inclui a distinção entre registro, sinalização de
chamada, transporte RTP e ciclo de vida dos canais/bridge. O Asterisk mantém
duas pernas SIP: recebe o encerramento de uma e encerra a outra. O problema de
porta resolvido também distingue a porta local do cliente da porta da central.

Para futuras reproduções, desligar o logger SIP e o debug RTP ao terminar.
Manter somente resumos sanitizados no repositório: não versionar logs brutos,
`Authorization`, `Proxy-Authorization`, desafios Digest ou arquivos de senhas.

Para reiniciar configurações de telefone/transporte, sem chamadas ativas:
`docker compose restart asterisk`. Alterações no Compose exigem
`docker compose up -d --wait`. Para desligar: `docker compose stop`.
Limpeza dos recursos locais: `docker compose down --volumes`, preservando
`secrets/`; veja o aviso de descarte no README. Não apagar dados de outros projetos.

Para bloquear chamadas imediatamente, pare o serviço. Para voltar à configuração
anterior, restaure os `.conf` versionados e reinicie, preservando os segredos.
A Fase 1 está concluída e marcada no plano. A integração AMI/API foi autorizada
posteriormente; seu estado e aceite estão em [PHASE2_AMI.md](PHASE2_AMI.md).

## Referências oficiais

- [Configuração PJSIP na série 22](https://docs.asterisk.org/Asterisk_22_Documentation/API_Documentation/Module_Configuration/res_pjsip/)
- [PJSIP e NAT](https://docs.asterisk.org/Configuration/Channel-Drivers/SIP/Configuring-res_pjsip/Configuring-res_pjsip-to-work-through-NAT/)
- [Aplicação Dial e opção i](https://docs.asterisk.org/Asterisk_22_Documentation/API_Documentation/Dialplan_Applications/Dial/)
- [Campos do MicroSIP](https://www.microsip.org/help)
