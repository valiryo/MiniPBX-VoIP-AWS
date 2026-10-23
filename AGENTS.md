# AGENTS.md — MiniPBX (Codex)

Estas instruções se aplicam a todo o repositório. Leia também `docs/PROJECT_SPEC.md` e `docs/IMPLEMENTATION_PLAN.md` antes de implementar.

## Missão e prioridade

Construir um **laboratório pessoal e temporário de telefonia VoIP e AWS**. O estudante **já conhece TypeScript, Node.js, NestJS, React, Prisma e Docker**; essas tecnologias são meios, NÃO os temas de estudo. Priorize:

1. Asterisk, PJSIP, SIP, RTP, ramais, dialplan, fluxo de chamadas e depuração.
2. AMI: ações, eventos, correlação, reconexão e integração real com a aplicação.
3. AWS: EC2, IAM, VPC/subnet, Security Groups, S3 e CloudWatch (somente onde justificável).
4. Terraform, inicialização da EC2, Docker Compose e remoção auditável de infraestrutura.

Não implementar IA, LLM, STT/TTS, serviços de telefone público, microserviços, Kubernetes, RDS, filas, múltiplos tenants nem UI sofisticada. CloudFront e SES são somente laboratórios FUTUROS e opcionais, sujeitos a outra autorização.

## Fluxo de trabalho do Codex

- Trabalhe em **uma fase pequena e verificável por vez**, conforme `docs/IMPLEMENTATION_PLAN.md`. Não avance para a próxima fase sem o usuário pedir.
- Ao iniciar uma fase: leia os arquivos existentes; exponha um plano curto com critérios de aceitação; modifique somente o necessário.
- Priorize **testar telefonia real local** cedo. Não invista em scaffolding, CRUD genérico, design de interface ou abstrações antes de validar dois ramais SIP e uma chamada.
- Ao finalizar, informe: arquivos alterados, comandos rodados, resultados e **o que o estudante aprendeu sobre SIP/Asterisk/AMI ou AWS**. Distinguir testes automatizados de testes manuais ainda pendentes.
- Faça explicações objetivas nas decisões de telefonia/AWS: *o que faz, por que precisamos, como testar e como reverter*. Não dê tutoriais básicos de TypeScript/NestJS.
- Prefira documentação oficial, ferramentas gratuitas, logs verificáveis, configuração simples e versões fixadas quando oportuno. Não afirme que algo funciona sem evidência.
- Não executar `git push`, excluir dados do usuário, alterar a conta AWS nem modificar infraestrutura fora do projeto sem autorização.

## Barreiras de custo e mudanças remotas — INEGOCIÁVEIS

- **Modo local é o padrão.** Nenhuma conta AWS, cobrança ou serviço externo é pré-requisito para desenvolver.
- **NUNCA** executar `terraform apply`, `terraform destroy`, AWS CLI de criação/alteração/remoção, deploy remoto, upgrade da conta ou configuração que possa gerar gasto sem **autorização explícita para a ação concreta**. Não usar `-auto-approve`.
- `terraform fmt`, `terraform validate` e testes estáticos locais são permitidos. `terraform plan` autenticado e comandos AWS somente leitura dependem de autorização para acessar a conta e devem usar perfil/região explícitos. Nunca assumir ou usar silenciosamente o perfil `default`.
- Antes de solicitar deploy, apresentar: inventário exato, região/conta (ID mascarado quando exibido), estimativa conservadora com preços atuais, elegibilidade ao **plano da conta** e aos créditos, cenários de cobrança, tempo de vida, rollback e roteiro de auditoria. Se não for possível conferir elegibilidade/custos, **não implantar**.
- O alvo é **zero cobrança do próprio bolso e zero recursos faturáveis ao fim**, mas **NÃO prometer fatura final zero**: cobranças passadas, impostos, atrasos e itens fora do Terraform podem persistir. Um Budget não é bloqueio rígido de gasto.
- Não deixar a EC2 apenas em `stopped` como medida final: considerar EBS, IPv4 público, S3, CloudWatch e outros. `terraform destroy` exige autorização independente e inventário pós-destruição. Preservar `terraform.tfstate` até encerrar e auditar.
- Nunca criar troncos SIP, linhas/números reais ou chamadas para PSTN. Todos os destinos permitidos devem ser **ramais internos explicitamente autorizados**.

## Segurança mínima obrigatória

- AMI (porta usual 5038) acessível apenas ao back-end por rede privada; **nunca publicar na internet**.
- No EC2, limitar SSH, SIP e RTP a IPs/CIDRs conhecidos. Não usar `0.0.0.0/0` para SSH/SIP/RTP. Painel/API privados ou acessíveis por túnel SSH; nada de painel administrativo aberto sem autenticação e HTTPS.
- Credenciais SIP/AMI fortes e distintas, geradas no ambiente, jamais commitadas, exibidas em logs, armazenadas no `user_data` ou Terraform state.
- IAM Role de mínimo privilégio; S3 privado e public-access-block; sem chaves AWS estáticas no servidor ou repositório.
- Gravação de áudio desativada por padrão; apenas dados fictícios. Limitar portas, logs, retenção e tamanhos de arquivos.
- O dialplan deve proibir chamadas externas independentemente das validações do NestJS (defesa em profundidade).

## Qualidade e evidência

- Testes curtos e focados (validação de ramais, lógica de eventos e integração AMI simulada); validar **manualmente** registro SIP, mídia RTP bidirecional, chamadas e hangup reais.
- `Originate` aceito pela AMI **não** significa chamada atendida; somente relatar estados/durações sustentados por eventos/CDR reais.
- Não inventar resultados nem números de custo. Quando dependente de Windows/WSL2/Docker NAT, apontar limitações e registrar o caminho reproduzível encontrado.
- Documentar **como subir, diagnosticar, desligar e limpar** cada componente. Toda etapa AWS exige `docs/COSTS_AND_CLEANUP.md` e `docs/TEARDOWN_REPORT.md` se houver implantação.

## Fontes de verdade

- Escopo/arquitetura/segurança: `docs/PROJECT_SPEC.md`.
- Sequência e critérios: `docs/IMPLEMENTATION_PLAN.md`.
- Estado real e comandos: `README.md` (a criar durante a implementação).
- Nunca substituir as regras de custo/segurança por conveniência ou por suposições sobre o Free Tier.
