# MiniPBX — Especificação técnica para Codex

**Versão:** 2.0 — 23/10/2026  
**Natureza:** laboratório de estudo, pessoal, não comercial, temporário.  
**Áreas de estudo:** **telefonia VoIP + AWS + Terraform**.  
**Prioridade financeira:** não gastar dinheiro; após qualquer laboratório AWS, remover todo recurso do projeto capaz de gerar novos custos, com auditoria.  
**Execução padrão:** 100% local, sem conta AWS.

## 1. Por que este projeto existe

O estudante está se preparando para uma vaga de desenvolvedor júnior na **Wevy**, cujos diferenciais citam infraestrutura AWS (EC2, S3, CloudFront, SES e outros), Asterisk, VoIP, SIP, AMI e IA aplicada.

**IMPORTANTE PARA O CODEX:** o estudante **JÁ TEM EXPERIÊNCIA** com TypeScript, Node.js, NestJS, APIs REST, React, Prisma, PostgreSQL, Docker e desenvolvimento de SaaS. Ele NÃO quer um curso ou projeto centrado em aprender essas ferramentas. Utilize-as para reduzir o tempo de desenvolvimento e **redirecione o esforço de estudo para:**

1. **Telefonia (principal):** SIP, RTP, Asterisk/PJSIP, endpoints, registro de ramais, codecs, dialplan, AMI, eventos, falhas, NAT e diagnósticos.
2. **AWS (principal):** modelo EC2, IAM Roles, Security Groups, VPC/subnets, EBS, IPv4 público, S3 e observabilidade; noções de CloudFront e SES como extensões isoladas.
3. **Terraform/IaC (principal):** declarar infraestrutura, planejar, conferir custo e segurança, criar e **remover sem resíduos** quando expressamente autorizado.
4. **Integração (suporte):** mínima API NestJS e painel React. Não perder tempo refinando UI, regras de negócio triviais ou padrões arquiteturais excessivos.

**Não incluir IA no MVP.** Se for mencionado futuramente, tratar como uma trilha de estudo completamente opcional e separada.

## 2. Resultado esperado

Construir um protótipo chamado **MiniPBX** que possibilite:

- Configurar **dois ramais SIP internos** (1001 e 1002) no Asterisk.
- Registrar dois softphones gratuitos (por exemplo, Linphone), idealmente em dois dispositivos ou clientes de teste.
- Realizar uma **ligação de voz real 1001 → 1002** e, depois, no sentido inverso, com áudio bidirecional.
- Inspecionar sinalização SIP, canais, chamadas, bridge e mídia RTP, identificando por logs por que chamadas funcionam ou falham.
- Conectar o NestJS ao **AMI** para consultar estado dos ramais e solicitar **chamadas internas** via `Originate`.
- Consumir eventos reais, correlacionar tentativas de chamada e registrar um histórico pequeno, sem forjar estados/durações.
- Exibir somente o necessário em um painel: ramais, disponibilidade conhecida, botão de ligação e histórico (sem design complexo).
- Provisionar **opcionalmente** um ambiente AWS efêmero com Terraform para testes de cloud, comprovar que funciona e depois destruí-lo com auditoria.

**Critério mais importante de sucesso:** uma chamada SIP/RTP local demonstrável + integração AMI verificável + infraestrutura Terraform revisável e removível. Publicar na AWS somente se o risco financeiro for aceito e a conta permitir.

## 3. Escopo / fora do escopo

### Obrigatório — laboratório local

- Asterisk com **PJSIP**, dois usuários/ramais fixos e dialplan *somente interno*.
- Documentação operacional de SIP, RTP e AMI: comandos, portas, registro, testes e troubleshooting.
- Integração NestJS↔AMI efetiva; `Originate`, status real, reconexão e histórico.
- SQLite+Prisma somente para persistência pequena (ou solução igualmente simples se justificada).
- Compose e scripts básicos, sem exigir serviços pagos.
- Testes automatizados para regras simples + roteiros **manuais** para áudio/telefones.
- Uma página React mínima **após** o fluxo de telefonia estar funcionando; interface de linha de comando/API é aceitável nas fases iniciais.

### Obrigatório — infraestrutura preparada, execução remota opcional

- Código Terraform para uma arquitetura AWS mínima, sem criar recursos por padrão.
- Pré-voo de elegibilidade, análise de preços e inventário de recursos planejados.
- Scripts e documentação de **plan / apply aprovado / destroy aprovado / audit** com verificação manual de billing.
- Documentar o papel de EC2, IAM, Security Group, EBS, VPC, IPv4, S3 e CloudWatch.

### Opcional, apenas depois do MVP e nova revisão de custo

- S3 privado para poucas gravações **fictícias ou arquivos pequenos de teste** (sem gravação automática de conversas).
- CloudWatch Logs com retenção curtíssima ou métricas simples, quando o custo justificar.
- CloudFront para publicar um artefato estático pequeno, ou SES em **modo sandbox** com identidades autorizadas (laboratórios separados; não criar serviços por padrão).
- WebSocket/SSE apenas se realmente agregar à observação de eventos; polling é suficiente para o MVP.

### Não fazer

LLMs, STT, TTS, agentes conversacionais, números telefônicos externos, troncos SIP, chamadas PSTN, campanhas automáticas, telemarketing, CRUD de ramais, multi-tenant, autenticação complexa, RDS obrigatório, Redis obrigatório, microsserviços, Kubernetes/EKS/ECS, load balancers, NAT Gateway, domínio pago, e-mail marketing ou CI/CD com deploy AWS automático.

## 4. Conceitos de telefonia que o projeto DEVE demonstrar

| Conceito | Evidência prática esperada |
|---|---|
| VoIP | Voz entre dois softphones via rede IP, sem telefonia pública |
| SIP | Registro e sinalização (`REGISTER`, `INVITE`, `180 Ringing`, `200 OK`, `ACK`, `BYE`) capturados em logs quando aplicável |
| RTP | Verificar caminho da mídia, codecs e áudio bidirecional |
| Asterisk | Execução da central, CLI, módulos e canais |
| PJSIP | Endpoint, auth, AoR, contatos registrados e estado de alcance |
| Dialplan | Contexto que só permite chamar 1001 e 1002; nenhuma rota externa |
| AMI | Sessão TCP autenticada privada, `Originate`, eventos e controle de erros |
| NAT | Compreender portas e endereços em LAN, contêineres e EC2; validar configuração antes de exposição externa |
| Histórico | IDs reais/correlação de eventos, estados coerentes e duração somente quando confiável |

**Explicações essenciais para o estudante:** qual camada usa SIP versus RTP; por que um ramal registrado não garante áudio; por que `Originate` confirma solicitação, mas não atendimento; diferença entre AMI (controle/eventos) e ARI (controle avançado de aplicações/mídia, fora de escopo).

### Fluxo esperado (local)

```text
 Softphone 1001 -- SIP/RTP --+
                             |--> Asterisk (PJSIP + dialplan)
 Softphone 1002 -- SIP/RTP --+            |
                                         | AMI TCP (rede privada)
 CLI/API NestJS -- POST /calls ----------+
      |                                  |
      +-- GET /extensions, GET /calls ---+
      |
 SQLite/Prisma (histórico)        React mínimo (após telefonia)
```

**Iniciar chamada via AMI:** usar `Originate` e um `Context` estritamente interno. Exemplo de fluxo conceitual: API valida ramais → envia `Originate` para chamar 1001 e, após atendimento, encaminha para 1002 pelo dialplan → acompanha eventos (`OriginateResponse`, `Newchannel`, `Newstate`, `BridgeEnter/Leave`, `Hangup` e/ou CDR, conforme disponíveis) → atualiza histórico. A nomenclatura e a semântica devem ser verificadas contra a versão do Asterisk escolhida.

### Ambiente de desenvolvimento

- Preferir Linux/WSL2 com Docker Compose, conforme disponibilidade do computador. **Atenção:** softphone em Windows, telefone na LAN e Asterisk dentro de Docker/WSL2 podem exigir tratamento adicional de NAT, UDP e encaminhamento de portas.
- O Codex deverá detectar o SO e a rede disponíveis, apresentar a abordagem mais simples e registrar os parâmetros que efetivamente funcionarem.
- Se o softphone em outro dispositivo complicar NAT, validar primeiro **dois clientes locais**; isso não justifica migrar prematuramente para AWS.
- Credenciais SIP/AMI sempre injetadas localmente a partir de arquivos ignorados pelo Git; não usar exemplos com senhas fixas fracas.

## 5. Stack e arquitetura de implementação

| Peça | Escolha | Racional |
|---|---|---|
| Central telefônica | Asterisk/PJSIP | Principal objeto de aprendizado |
| Clientes | Linphone ou softphone gratuito equivalente | Registrar ramais e testar mídia real |
| Controle/telemetria | AMI | Integração direta com back-end por ações/eventos |
| API | NestJS/TypeScript | Familiaridade existente; wrapper mínimo para AMI |
| Persistência | SQLite + Prisma | Leve, barata, descartável |
| Painel | React + Vite | Apenas uma tela, sem biblioteca visual pesada |
| Ambiente | Docker Compose | Reprodutibilidade, sem cloud local obrigatória |
| IaC | Terraform HCL (provider AWS) | Principal objeto de aprendizado em AWS |
| Setup EC2 | Cloud-init/user_data SEM segredos | Preparar host para containers |
| AWS | EC2 + EBS + IAM + SG + rede; S3/CloudWatch graduais | Aprendizado de deploy/custos/segurança |

Não criar monorepo complexo, autenticação de produção, múltiplos bancos, DDD/CQRS para um protótipo pequeno ou pipelines de deploy automático por conveniência.

## 6. API mínima (quando a telefonia estiver validada)

```text
GET  /health            -> estado da API
GET  /telephony/health  -> conectividade AMI / Asterisk (sem segredos)
GET  /extensions        -> [1001, 1002] + presença/estado conhecido
POST /calls             -> {"from":"1001","to":"1002"}; inicia chamada interna
GET  /calls             -> histórico pequeno
GET  /calls/:id         -> detalhes + eventos conhecidos
```

Regras:

- Aceitar **somente** `1001` e `1002` como `from/to`; devem ser diferentes.
- `POST /calls` retorna um ID de tentativa e estado inicial como `requested`, **não** `answered` antes de confirmação.
- Guardar pelo menos horário, origem/destino, estado e IDs de correlação (`ActionID`, `Uniqueid`/`Linkedid` se obtidos).
- Estados plausíveis: `requested`, `ringing`, `answered`, `ended`, `failed`, `unknown`, com **transições fundamentadas nos eventos reais**.
- Falha de AMI, timeouts e reinícios não devem gerar resultados falsos; exibir `unknown` quando necessário.
- Incluir testes de validação de ramais e processamento/correlação de eventos; manter logs sem credenciais.
- Sem acesso público à API administrativa; acessar via LAN privada ou túnel SSH no deploy.

## 7. AWS: arquitetura didática, efêmera e de menor superfície possível

```text
                   AWS — SOMENTE DEPOIS DE AUTORIZAÇÃO

             Terraform [plan -> revisão -> apply autorizado]
                                |
                   EC2 Linux (uma instância)
                      EBS raiz pequeno e descartável
                        Docker / Compose
                      +---------+----------+
                      |                    |
                   Asterisk             API NestJS
                   SIP/RTP              SQLite
                      |                    |
                 Softphones              IAM Role
             (IPs explicitamente           |
                  permitidos)         S3 privado [opcional]
                                         CloudWatch [opcional]

 Segurança:
 - SG restringe SIP/RTP/SSH por CIDRs aprovados
 - AMI interno e nunca publicado
 - painel via túnel SSH (não publicar painel administrativo)
 - sem linhas telefônicas externas
```

### Recursos Terraform que fazem sentido

1. **EC2:** uma instância Linux de tamanho escolhido **após verificar a elegibilidade e os preços da conta/região**. Capacidade suficiente para Docker, NestJS e Asterisk em teste; nenhum tamanho é garantido como gratuito.
2. **EBS:** volume raiz pequeno, `delete_on_termination = true`, sem snapshots/AMIs adicionais. SQLite e gravações locais são descartáveis.
3. **VPC/Subnet:** usar dados de infraestrutura existente (ex.: default VPC/subnet), **somente após conferência**, sem alterar/deletar infraestrutura compartilhada; ou criar rede isolada simples se houver motivo e sem NAT Gateway. Qualquer recurso criado deve ser declarado e removível.
4. **Security Group:** SSH (se usado), SIP e faixa RTP mínima abertos somente a IP/CIDR de teste explícitos; permitir tráfego de saída necessário, justificar regras.
5. **IAM Role/Instance Profile:** mínimo privilégio para o que realmente for usado; não criar chave de acesso permanente da conta na EC2.
6. **S3 opcional:** bucket com bloqueio total de acesso público; somente arquivos pequenos e fictícios, sem versionamento, replicação ou lifecycle complexo. Documentar como apagar objetos antes do bucket.
7. **CloudWatch opcional:** grupo de logs pequeno com retenção curta, limite de verbosidade e aferição de custos; não criar alarmes/métricas customizadas desnecessários.
8. **Bootstrap:** cloud-init instala Docker e inicializa ambiente, mas **não contém senhas, chaves SIP, tokens AMI nem credenciais AWS**. Fornecimento de segredos por canal local seguro após criação, nunca pelo Terraform state.

Para o primeiro deploy, evite CloudFront, SES, RDS, ECS/EKS, ALB, NAT Gateway, Elastic IP adicional, Route 53, domínios pagos, ACM privado, KMS com chave própria, snapshots automáticos, instâncias reservadas ou terceiros pagos. **Endereço IPv4 público efêmero pode gerar custo** e deve constar da estimativa.

### Serviços AWS como objetivos de estudo

- **EC2 + EBS:** provisionar, conectar, diagnosticar Docker, observar comportamento de parada e encerramento.
- **IAM:** entender role/instance profile, política mínima e evitar access keys.
- **VPC/SG:** entender CIDR, UDP SIP/RTP, TCP SSH/AMI e como restringir exposição.
- **S3:** upload de arquivo de laboratório pequeno por SDK, com autenticação por IAM Role; verificar acesso negado a público.
- **CloudWatch:** visualizar logs/saúde somente se aprovado; comparar com `docker logs`.
- **CloudFront e SES:** registrar na documentação **onde entrariam**. Implantar apenas como mini laboratórios independentes com outra autorização, depois do teardown principal.

## 8. CUSTOS AWS: requisito de segurança financeira, não uma nota de rodapé

**Objetivo:** desenvolver sem desembolsar, implantar temporariamente somente se comprovadamente aceitável e **encerrar todos os recursos geradores de novos custos do projeto** após cada experimento.

**Limite epistemológico:** não se pode prometer que o faturamento ficará literalmente em zero; cobranças de uso passado podem aparecer com atraso, tributos/serviços podem ter regras específicas e itens gerenciados fora do Terraform podem permanecer.

### AWS Free Tier — não presumir elegibilidade

Há distinção entre **plano de conta gratuita** para novas contas elegíveis (créditos/duração/restrições próprios) e **plano pago** (pode gerar cobranças quando limites/créditos são ultrapassados). A elegibilidade, saldo, região, instância e serviços precisam ser conferidos **na conta concreta** antes de qualquer implantação. Não criar/atualizar para plano pago por conta própria. Referência: [AWS — escolha de planos](https://docs.aws.amazon.com/pt_br/awsaccountbilling/latest/aboutv2/free-tier-plans.html).

**Regras absolutas para Codex:**

- Nenhuma mutação de recursos AWS, `terraform apply`, `terraform destroy`, `aws ... create/update/delete`, compra, upgrade ou deploy sem permissão **explícita para aquela ação**. Nem durante validação, nem por tentativa de corrigir erro.
- `terraform fmt`/`validate`, lint/testes de scripts e documentação podem rodar offline. AWS CLI somente leitura e `terraform plan` autenticado só depois que o usuário autorizar acesso à conta, com `AWS_PROFILE` e `AWS_REGION` explícitos; não usar conta ou perfil `default` silenciosamente.
- **GATE de deploy:** mostrar previamente perfil, região, lista de recursos, preços atuais/estimativa de duração, riscos por serviço, créditos disponíveis verificados, exposição de portas, como destruir e como auditar; obter autorização do usuário para aquela implantação.
- Limitar tamanho de instância e EBS, período de teste, tráfego e bytes S3; escolher critérios concretos após pesquisar preços da região.
- **Não confiar somente em AWS Budgets:** alertas podem atrasar e não impedem cobranças imediatamente. Não configurar um orçamento como única garantia.
- **Não confiar somente em `stop` da EC2:** EBS e outros recursos podem persistir e gerar cobrança.
- **Não confiar somente em `terraform destroy`:** verificar recursos residuais, outras regiões se usadas, conta de faturamento e lançamentos posteriores.
- Todos os recursos criados devem ter tags equivalentes a `Project=minipbx-study`, `Environment=ephemeral-lab`, `Purpose=learning-only` (quando suportadas). Não alterar ou destruir recursos sem essas identificações que já existiam na conta.
- O Terraform state é sensível e necessário para destruir. **Nunca publicar em Git**, não apagá-lo antes do teardown, não incluir senhas reais em variáveis que acabem no state.
- Se não for possível verificar plano/preços/créditos com confiança, **cancelar o deploy e manter o projeto local**. Isso é um resultado aceitável do projeto.

### Scripts/documentos exigidos ANTES de cloud apply

- `docs/COSTS_AND_CLEANUP.md`: preços verificados, análise de elegibilidade, inventário, riscos, proteção e plano de remoção.
- `scripts/aws-preflight.sh`: **somente leitura**, mostra identidade (sem expor detalhes desnecessários), perfil/região, ferramentas e requisitos de verificação manual no console; não cria nada.
- `scripts/cloud-plan.sh`: `fmt`, `validate` e `plan`, nunca `apply`; plano salvo localmente se necessário (ignorado no Git).
- `scripts/cloud-up.sh`: imprime plano, **não deve executar automaticamente**; se implementado, deve requerer confirmação explícita interativa e passo autorizado separadamente.
- `scripts/cloud-down.sh`: imprime inventário/plano de destruição, avisa perda de dados e exige autorização específica antes de agir.
- `scripts/aws-audit.sh`: inventário read-only na região/prefixo/tags e checklist de recursos fora do state; não anunciar garantia de ausência absoluta de custo.
- `docs/TEARDOWN_REPORT.example.md`: modelo de relatório; depois de uso real, produzir `docs/TEARDOWN_REPORT.md` com resultados e pendências.
- `.gitignore`: state e backups, `.terraform/`, `*.tfplan`, `*.tfvars` reais, `.env`, chaves SSH, credenciais SIP/AMI, dumps de dados.

### Teardown obrigatório (se houver deploy aprovado)

1. Confirmar que o estudante permite descartar dados da demo; guardar apenas evidências não sensíveis.
2. Revisar `terraform plan -destroy`; obter autorização específica e executar destruição do projeto.
3. Auditar EC2 e EBS, snapshots, AMIs criadas, IPv4/EIP, ENIs, Security Groups, IAM/Instance Profiles, S3 (incluindo objetos e versões), CloudWatch Logs/alarms e qualquer outro recurso do projeto.
4. Não excluir VPC, subnet ou outros itens preexistentes compartilhados apenas para 'limpar' o laboratório.
5. Conferir recursos nas regiões utilizadas e itens globais aplicáveis; revisar Billing/Cost Explorer, Free Tier/créditos e atualizações posteriores da fatura.
6. Documentar evidências e **pendências**. Se algo restar, declarar teardown incompleto e propor correção; sem remoção adicional sem autorização.
7. Guardar state local **protegido** até confirmação do teardown; decidir sua exclusão posteriormente, pois pode ser necessário para corrigir resíduos.

## 9. Segurança de telefonia e AWS

- Sem tronco SIP, provedores de telefonia, números públicos ou discagem para PSTN; dialplan só permite 1001 e 1002.
- SIP/RTP expostos na EC2 somente para IPs de teste conhecidos, com senhas fortes e portas mínimas. AMI no segmento de rede interno, jamais porta aberta ao mundo.
- Painel administrativo privado; acesso remoto por túnel SSH em vez de deixar API/admin pública.
- Credenciais SIP e AMI geradas por usuário/local script seguro e ignoradas pelo Git; nunca em Terraform `user_data` ou em logs.
- Restringir a instância por SG e aplicar as proteções locais cabíveis. Evitar anúncios de serviços públicos desnecessários.
- Buckets privados com bloqueio total de acesso público; IAM mínimo. Não cadastrar cartões ou serviços de terceiros pagos por conveniência.
- Sem dados pessoais reais; gravação de chamadas desabilitada no MVP.
- Não presumir que Asterisk dentro de Docker terá mídia RTP bidirecional sem ajustes de NAT. Testar antes de anunciar funcionalidade pronta.

## 10. Estrutura esperada do repositório

```text
minipbx/
├── AGENTS.md
├── README.md                       # criar durante a fase 0
├── compose.yaml
├── .gitignore
├── .env.example
├── apps/
│   ├── api/                        # NestJS: somente interface AMI e histórico
│   └── web/                        # painel mínimo, somente após telefonia
├── infra/
│   ├── asterisk/                   # pjsip.conf, dialplan e manager.conf templates
│   ├── terraform/
│   │   ├── providers.tf
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── terraform.tfvars.example
│   └── cloud-init/
├── scripts/
│   ├── aws-preflight.sh
│   ├── cloud-plan.sh
│   ├── cloud-up.sh
│   ├── cloud-down.sh
│   └── aws-audit.sh
└── docs/
    ├── PROJECT_SPEC.md
    ├── IMPLEMENTATION_PLAN.md
    ├── TELEPHONY_LAB.md             # comandos CLI, capturas e diagnóstico
    ├── AWS_LAB.md                   # conceitos/arquitetura/decisões de cloud
    ├── COSTS_AND_CLEANUP.md
    └── TEARDOWN_REPORT.example.md
```

Essa é uma estrutura sugerida: criar diretórios/arquivos **conforme cada fase exigir**, sem produzir muitos arquivos vazios de início.

## 11. Critérios de aceitação finais

- [ ] Duas contas SIP conseguem se registrar e falar entre si por RTP em ambiente de testes.
- [ ] O estudante consegue inspecionar e explicar um fluxo SIP completo, um caso de falha e o papel do NAT.
- [ ] Asterisk/PJSIP/dialplan limitados a ramais internos; sem troncos e sem chamadas externas.
- [ ] API consegue solicitar chamada por AMI, observar eventos reais e mostrar resultados honestos.
- [ ] Painel web mínimo mostra ramais e histórico, sem virar o foco do projeto.
- [ ] Infraestrutura AWS representada em Terraform, explicada e validável localmente.
- [ ] Nenhum recurso de cloud é criado ou removido sem autorização específica.
- [ ] Se AWS for usada, o usuário aprende a operar EC2, SG/VPC, IAM e, opcionalmente, S3/CloudWatch.
- [ ] Se AWS for usada, teardown e auditoria documentados; sem recursos faturáveis remanescentes **identificados**; pendências não verificáveis relatadas, sem alegar custo zero garantido.
- [ ] Todo o projeto é reproduzível localmente e compreensível em uma entrevista de dev júnior.

## 12. Referências oficiais

- [Asterisk — documentação](https://docs.asterisk.org/)
- [Asterisk AMI — Originate](https://docs.asterisk.org/Latest_API/API_Documentation/AMI_Actions/Originate/)
- [Asterisk AMI — eventos e ações](https://docs.asterisk.org/Latest_API/API_Documentation/)
- [AWS Free Tier — planos](https://docs.aws.amazon.com/pt_br/awsaccountbilling/latest/aboutv2/free-tier-plans.html)
- [AWS IAM Roles para EC2](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html)
- [AWS EC2 — ciclo de vida](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html)
- [AWS VPC — preços](https://aws.amazon.com/vpc/pricing/)
- [AWS Billing — cobranças inesperadas](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/checklistforunwantedcharges.html)
- [Terraform — state e dados sensíveis](https://developer.hashicorp.com/terraform/language/manage-sensitive-data)
- [Terraform — destroy](https://developer.hashicorp.com/terraform/cli/commands/destroy)
