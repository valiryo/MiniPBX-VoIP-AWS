# MiniPBX — Plano de implementação por fases (Codex)

**Estratégia:** telefonia real primeiro; AWS depois; código e UI são suporte. Executar uma fase por solicitação do usuário. Cada fase termina com demonstração, explicação dos conceitos novos e evidências verificáveis.

## Fase 0 — Preparação do laboratório (sem AWS)

**Objetivo:** garantir que o ambiente consiga executar Asterisk e softphones sem gastar nada.

- Examinar SO, Docker/Compose, rede (incluindo Windows/WSL2, se presente) e ferramentas disponíveis.
- Escolher versão estável compatível do Asterisk e estratégia mínima de rede; registrar riscos de NAT.
- Criar `.gitignore`, exemplos de segredos, compose básico de Asterisk e `docs/TELEPHONY_LAB.md` inicial.
- NÃO começar pelo React/NestJS e não criar código Terraform executável ainda.

**Aceite:** Asterisk sobe localmente, há acesso à CLI e comandos de diagnóstico documentados. Nenhuma conta AWS necessária.

**Para aprender:** o que é PBX, PJSIP, SIP, RTP, portas, endpoint/auth/AoR e NAT.

## Fase 1 — Telefonia real entre ramais (maior prioridade)

**Estado atual (24/10/2026): concluída.** Sonda SIP/UDP aprovada na preparação;
chamadas 1001 → 1002 e 1002 → 1001, áudio, RTP bidirecional em `ulaw`, bridge e
encerramento confirmados pelo estudante. A validação complementar confirmou
`INVITE`, `100 Trying`, `180 Ringing`, `200 OK`, `ACK` e `BYE` nas chamadas.
Conflito UDP 5060 resolvido com porta local 5062 no Linphone. Critérios de
aceitação satisfeitos; evidências manuais registradas como resumos sanitizados,
sem logs SIP brutos. A Fase 2 foi autorizada posteriormente e tem seu estado
registrado na seção seguinte.
Roteiro e evidências: [PHASE1_CALLS.md](PHASE1_CALLS.md).

- Configurar ramais **1001 e 1002** com credenciais fortes, sem segredos no Git.
- Criar dialplan estritamente interno: somente ligação entre 1001 e 1002; nenhuma rota externa.
- Documentar registro via softphones gratuitos e diagnosticar registro/contatos (`pjsip show endpoints`, `pjsip show contacts` etc.).
- Fazer chamada 1001 → 1002 e 1002 → 1001 com áudio de ida e volta, observar `INVITE`, progresso, aceite, bridge e `BYE` nos logs.
- Documentar pelo menos um erro real ou simulado de registro/mídia e como identificá-lo (incluindo NAT/UDP quando aplicável).

**Aceite:** duas chamadas internas concluídas com áudio bidirecional. Se dependências locais impedirem a mídia, registrar evidência e correção sem migrar para a nuvem para mascarar o problema.

**Para aprender:** sinalização SIP vs transporte RTP; identificação de causas de 'chama, mas sem áudio'.

## Fase 2 — AMI + integração mínima (grande prioridade)

**Estado (24/10/2026): concluída.**
AMI privada, API NestJS, histórico SQLite nativo do Node e 14 testes aprovados.
Consultas AMI reais, autenticação, reconexão isolada e HTTP verificados. Chamada
1001 → 1002 pela API confirmada pelo estudante com áudio bidirecional e
desligamento normal; histórico sanitizado conferido, com dois canais na bridge,
`ended` e 75166 ms de conversa. Falha real com 1001 desregistrado confirmada:
`OriginateResponse: Failure`, estado `failed`, sem `answeredAt` ou duração de
conversa; registro reativado pelo estudante. Critérios de aceitação satisfeitos.
Roteiro: [PHASE2_AMI.md](PHASE2_AMI.md).
Modo local, sem AWS e sem painel React nesta etapa.

- Configurar conta AMI com permissões restritas; conexão acessível apenas internamente.
- Exercitar uma ação/consulta AMI e observar eventos reais por ferramenta simples antes do NestJS.
- Implementar NestJS mínimo com `POST /calls`, `GET /extensions`, `GET /calls`, `/health`, `/telephony/health` e SQLite apenas para histórico.
- Validar ramais internos, emitir `Originate`, correlacionar ações/eventos, gerenciar timeout e reconexão.
- Testar falha quando ramal não registrado/AMI desconectada e evitar confundir solicitação com atendimento.
- Criar testes unitários pequenos e documentação de fluxo de eventos.

**Aceite:** chamada disparada pela API, eventos registrados coerentemente e diagnóstico de problemas AMI disponível.

**Para aprender:** protocolo AMI, Originate, `ActionID`, `Uniqueid`, `Linkedid` e eventos de canais/bridges.

### Sequência da implementação autorizada

1. **AMI privada e primeiro exercício:** conferir ações, eventos e permissões
   na versão Asterisk 22 usada pelo projeto; gerar segredo AMI distinto em
   arquivo local ignorado; habilitar usuário de mínimo privilégio e acesso
   pela rede privada do Compose, sem publicar 5038 no host. Exercitar conexão
   autenticada, consulta de saúde/ramais e leitura de eventos por ferramenta
   simples antes de implementar a API. Não imprimir autenticação ou segredos.
2. **Originate interno e evidências:** solicitar somente 1001 → 1002 ou o
   inverso, reutilizando os contextos restritos. Observar as duas pernas e
   correlacionar `ActionID`, `Uniqueid` e `Linkedid` disponíveis. Distinguir
   solicitação aceita, primeiro ramal atendido e os dois participantes na
   bridge; registrar falhas reais com ramal desconectado.
3. **API mínima e histórico:** implementar apenas os endpoints previstos na
   especificação, com validação de origem/destino, conexão AMI persistente,
   reconexão, timeout e SQLite nativo do Node para histórico pequeno (decisão
   justificada no roteiro, sem adicionar ORM nesta fase). Manter API local
   e privada; usar `unknown` quando os eventos forem insuficientes. Calcular
   durações somente com evidências confiáveis, sem inferir atendimento a partir
   da resposta de aceitação do Originate.
4. **Validação e operação:** testes focados de ramais, correlação de eventos,
   integração AMI simulada, timeout e reconexão; teste real de chamada pela
   API e revisão das evidências. Documentar subida, diagnóstico e parada. Para
   reverter a integração, parar a API e desabilitar AMI, preservando os ramais
   e os segredos existentes e retomando as chamadas diretas nos softphones.

**Aceite da etapa:** chamada interna disparada pela API, resultado e
histórico sustentados por eventos reais, tratamento honesto de falhas e AMI
sem exposição pública. Aceite concluído com evidências sanitizadas de chamada
normal e falha real, além dos testes automatizados e consultas de diagnóstico.
Não avançar para a Fase 3 sem nova solicitação.

## Fase 3 — IaC AWS e segurança financeira (sem provisionar)

- Projetar uma única EC2 Linux (Docker Compose), EBS descartável, rede mínima, Security Group com IPs de teste, IAM Role/Instance Profile.
- Criar HCL Terraform, variáveis explícitas e `terraform fmt`/`terraform validate` sem necessidade de contas/recursos.
- Documentar opções e riscos de rede SIP/RTP e acesso administrativo por túnel SSH.
- Preparar S3/CloudWatch como módulos/recursos **desabilitados por padrão**, se simplificar o laboratório, sem confundir com serviços gratuitos garantidos.
- Criar scripts de pré-voo, plan, apply confirmado, destroy confirmado e auditoria; nenhum script deve fazer mudanças por surpresa.
- Redigir `docs/AWS_LAB.md` e `docs/COSTS_AND_CLEANUP.md`, incluindo pesquisa de preço **da região escolhida e elegibilidade real da conta** (só quando o usuário autorizar checagens).

**Aceite:** HCL validável, plan de infraestrutura auditável quando autorizado, modelo de ameaça/custos e teardown documentados; **zero recursos cloud criados**.

**Para aprender:** EC2, VPC, subnet, SG, IAM, EBS, IPv4, Terraform state, plan/apply/destroy.

## Fase 4 — AWS efêmera (opcional, exige duas autorizações distintas)

### Gate A: antes de criar qualquer recurso

Confirmar plano real da conta AWS, créditos, preços, região, estimativa do teste e riscos. Apresentar lista de recursos e comando `terraform plan`; obter **autorização explícita** para `terraform apply` de uma implantação específica. Sem informações confiáveis, parar aqui.

### Execução (somente autorizada)

- Provisionar EC2 mínima viável com IAM/SG e cloud-init sem segredos.
- Entregar credenciais/segredos por canal seguro, sem state ou logs; iniciar Asterisk/NestJS na EC2.
- Testar telefonia SIP/RTP apenas de IPs permitidos; monitorar recursos e consumo.
- Fazer os testes da sessão e registrar evidências fictícias.

### Gate B: encerrar sessão

- Explicar perda de dados temporários; pedir **autorização específica** para destruir.
- Rodar destroy e depois **auditar recursos residuais**. Se surgirem resíduos, detalhar cada um sem deletar automaticamente recursos fora do state.
- Conferir Billing/Free Tier no console e registrar necessidade de observar lançamentos posteriores.

**Aceite:** demonstração e auditoria do teardown; nenhuma afirmação de custo final zero sem dados. Se a conta não suportar deploy financeiramente seguro, aceitar a fase 3 como entrega cloud suficiente.

**Para aprender:** AWS na prática e capacidade de encerrar ambientes temporários de forma responsável.

## Fase 5 — AWS S3 / observabilidade e UI mínima (opcional, depois do essencial)

- Se usuário desejar e **aprovar custo novamente**, integrar S3 privado com pequenos objetos fictícios e IAM Role.
- Comparar logs locais e CloudWatch com limites baixos de retenção/volume; justificar necessidade antes de criar.
- Criar painel React de uma tela: ramais/estados, botão de chamada e histórico. Polling simples é suficiente.
- Registrar o papel de CloudFront e SES, sem ativá-los por padrão.
- Fechar documentação e checklist de portfólio. Se fizer novas implantações, repetir Gates A e B.

**Aceite:** interface enxuta, conceitos AWS documentados, projeto reproduzível e sem infraestrutura faturável deliberadamente mantida.

## Rotina de cada fase no Codex

1. Ler `AGENTS.md`, `docs/PROJECT_SPEC.md` e este plano.
2. Identificar estado real do repositório e propor **apenas** a próxima fase solicitada.
3. Implementar, testar o que puder e especificar testes manuais restantes.
4. Informar resultados e decisões de **telefonia/AWS**; não gastar explicações com sintaxe de TypeScript/NestJS.
5. Pedir autorização apenas quando uma ação cloud, destrutiva ou externa assim exigir.

## Marcadores de conclusão

- [x] Fase 0 — Asterisk sobe localmente
- [x] Fase 1 — dois ramais fazem chamadas com áudio; fluxo SIP, RTP e encerramento validados
- [x] Fase 2 — AMI integrada à API e histórico coerente; chamada e falha real validadas
- [ ] Fase 3 — Terraform validável e custos/teardown documentados
- [ ] Fase 4 — deploy AWS opcional + destruição auditada
- [ ] Fase 5 — extensões opcionais (S3/CloudWatch/painel)

**Nota:** Fases 4 e 5 não são pré-requisitos para considerar o laboratório local concluído. Por outro lado, é possível aprender os conceitos AWS da fase 3 sem criar nenhum recurso pago.
