# Tyvo Track

Painel React/Vite com coleta de eventos via Supabase Edge Functions e envio à Meta Conversions API.

## Desenvolvimento

Configure `.env` conforme `.env.example`, usando apenas a URL e a chave pública do Supabase. Chaves de serviço e tokens Meta ficam no servidor.

```sh
bun install
bun run dev --host localhost --port 3390 --strictPort
bun test tests
bun run test:e2e
bun run typecheck
bun run build
bun run build:edge
```

As funções estão em `supabase/functions`. O loader, o coletor e o processador compartilham a classificação de origem e as regras de payload. As migrações estão em `supabase/migrations`. Antes de aplicar a agenda de recuperação, configure `tyvo_meta_processor_key` no Supabase Vault com a chave de serviço do projeto. O cron acessa esse segredo por referência.

Os testes de navegador usam o Google Chrome instalado e simulam as chamadas ao Supabase, sem modificar os dados da conta. A validação de chaves de serviço legadas depende da migração `20260911001000_verify_service_request.sql`; a exclusão auditada do painel depende de `20260911000000_atomic_property_deletion.sql`.

Use Configurações → Instalação para obter o script de cada propriedade e as orientações de UTMs da bio. Não trate fbclid como prova de tráfego pago.

[Auditoria, correções, testes e limitações — 10/09/2026](docs/auditoria-meta-2026-09-10.md)
