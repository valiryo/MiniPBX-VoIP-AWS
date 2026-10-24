# MiniPBX — laboratório local de VoIP

Foco: Asterisk, SIP, RTP e AMI; AWS/Terraform nas fases posteriores.
Fase 0 validada; **Fase 1 concluída em 24/10/2026**, com chamadas, áudio, RTP,
fluxo SIP, bridge e encerramento validados pelo estudante usando Linphone +
MicroSIP no próprio Windows. Ramais 1001/1002 e discagem interna configurados.
Nenhuma conta AWS, API, banco ou interface web é necessária.

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
docker compose config --quiet
docker compose up -d --wait --wait-timeout 60
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

O gerador cria senhas distintas de 256 bits em `secrets/`, ignorado pelo Git,
e preserva o conjunto existente nas execuções seguintes. Somente `sip-auth.conf`
é montado no Asterisk, para leitura. Não existe senha padrão, nem interpolação
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
declara (sons, chaves, provisionamento, logs e spool). A gravação de chamadas
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
  SIP/RTP publicados somente em loopback; AMI/HTTP e gravação desativados.
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
Fase 2 apenas planejada no plano de implementação, sem início automático.
Não foram executados comandos AWS/Terraform.
