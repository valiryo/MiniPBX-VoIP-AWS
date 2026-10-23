# Comece aqui — MiniPBX com Codex

Este pacote foi concebido para ser extraído **na raiz de um repositório novo** e utilizado no Codex.

## Arquivos

- `AGENTS.md`: regras persistentes que o Codex consulta enquanto trabalha no repositório.
- `docs/PROJECT_SPEC.md`: visão completa de escopo, arquitetura, segurança e custos.
- `docs/IMPLEMENTATION_PLAN.md`: fases, critérios de aceitação e travas antes da AWS.

## Prompt inicial para enviar ao Codex

> Leia `AGENTS.md`, `docs/PROJECT_SPEC.md` e `docs/IMPLEMENTATION_PLAN.md` integralmente. Este é um projeto **de estudo de telefonia VoIP (Asterisk, SIP, RTP, AMI) e AWS/Terraform**, e NÃO um estudo de NestJS ou TypeScript, que já conheço. Priorize aprendizado de telefonia e AWS com entregas práticas, sem overengineering. **Trabalhe somente na Fase 0:** analise meu ambiente e prepare o laboratório Asterisk local, explique os conceitos de telefonia envolvidos, documente como testar e não crie infraestrutura AWS. Não execute qualquer mutação de recursos cloud nem comandos de cobrança. Antes de escrever código, apresente um plano enxuto para esta fase.

## Regra prática

Não forneça credenciais AWS ao Codex na Fase 0, 1 ou 2. Mantenha o laboratório local até as chamadas reais e a AMI funcionarem. Para usar a AWS na Fase 4, revise conta, custos, plano, permissões e destruição antes de qualquer `apply`.

## Como acompanhar o aprendizado

Ao terminar cada fase, peça ao Codex: "Explique apenas os conceitos novos de telefonia ou AWS que implementamos, como testá-los por comandos e quais problemas reais resolvemos".
