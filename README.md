# MiniPBX — laboratório local de VoIP

Foco: Asterisk, SIP, RTP e AMI; AWS/Terraform nas fases posteriores.
Implementado somente o escopo da **Fase 0**: central local, CLI e diagnóstico.
Nenhuma conta AWS, API, banco ou interface web é necessária.

## Ambiente verificado em 23/10/2026

| Item | Evidência |
|---|---|
| Host | Windows, build 26200; PowerShell 5.1 |
| WSL | Ubuntu e docker-desktop, versão 2; inicialmente parados |
| Docker | Cliente e motor 29.4.3; contexto `desktop-linux` |
| Compose | 5.1.3 |
| Rede | Wi-Fi, WSL/Hyper-V e Radmin VPN; publicar apenas em loopback |
| Asterisk | 22.11.0, imagem comunitária `andrius/asterisk`, Debian Trixie |
| Softphones | Linphone/MicroSIP não encontrados nas chaves de instalação consultadas; teste de microfone pendente |

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
Esperado nesta fase: PJSIP registrado como driver, um transporte UDP,
nenhum endpoint/contato e zero extensões nos contextos `default` e `internal`.
Não há contas SIP configuradas para registrar ou realizar chamadas ainda.

Para executar um comando sem entrar na console:

```powershell
docker compose exec -T asterisk asterisk -rx 'core show version'
docker compose logs --tail 80 asterisk
```

O [roteiro de telefonia](docs/TELEPHONY_LAB.md) explica as saídas, portas, NAT,
segredos e os próximos exercícios. `.env.example` reserva nomes para segredos
futuros, mas a Fase 0 não consome nem gera credenciais.

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
declara (sons, chaves, provisionamento, logs e spool). Não há dados de chamadas
nesta fase. Os arquivos do repositório e a imagem baixada permanecem.
Não use `docker system prune` para limpar este projeto.

## Estado do aceite

- Verificações locais por comandos: Asterisk 22.11.0 sobe saudável, CLI responde,
  driver PJSIP carregado, SIP em loopback, faixa RTP 10000–10019 configurada,
  dialplan sem destinos e AMI/HTTP desativados.
- Verificação de ciclo de vida: parada e nova subida locais.
- Sem suíte de testes unitários nesta fase; a evidência é a execução real do contêiner.
- Aviso residual da ajuda interna de Stasis observado na inicialização;
  contexto e evidência registrados no roteiro de telefonia.
- Manuais pendentes para a Fase 1: instalar/abrir dois softphones, testar microfone,
  registrar 1001/1002, ligar nos dois sentidos, verificar RTP e hangup.
  A publicação das portas ainda não comprova entrega UDP nem áudio bidirecional.

Fontes de escopo e sequência: [AGENTS.md](AGENTS.md),
[especificação](docs/PROJECT_SPEC.md) e [plano](docs/IMPLEMENTATION_PLAN.md).
Somente a Fase 0 foi implementada; não foram executados comandos AWS/Terraform.
