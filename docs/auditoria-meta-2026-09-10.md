# Auditoria de rastreamento e integração Meta — 10/09/2026

Projeto Supabase: **Tracker Biteti** (`tqqqnmdffmzolnlrggqd`).

As correções do coletor e do envio foram publicadas no Supabase. As alterações do painel estão no projeto local e no build em `dist/`. Não foi feita uma publicação do painel na Vercel.

## Evidências da auditoria

A consulta inicial de todo o histórico de `fb_events_raw` encontrou:

| Resultado | Quantidade |
|---|---:|
| Registros no histórico consultado | 180.363 |
| Registros marcados como processados | 180.363 |
| Resposta com eventos recebidos pelo Meta | 179.986 |
| Resposta com erro do Meta | 327 |
| Processados sem confirmação nem erro registrado | 50 |
| Grupos com mesmo property_id, event_name e event_id repetidos | 244 |

Os 244 grupos demonstram duplicatas na base; não demonstram, por si só, duplicação de conversões no Gerenciador de Anúncios. O Meta pode ter deduplicado eventos com a mesma identidade.

Entre os erros históricos havia 159 de timestamp (subcódigo 2804004), 94 de autenticação (código 190), 11 de parâmetro (2804003), 56 de código 1 e 7 de código 2. Esses erros históricos não significam que todos os tokens atuais estejam inválidos. Na consulta dos sete dias anteriores à auditoria, os 683 registros encontrados estavam aceitos; o histórico continuava crescendo durante a análise.

Foram encontrados 154.093 registros sem `utm_source` e sem `utm_medium`, dos quais 145.677 tinham `fbc`. Outros 2.658 tinham `utm_source=ig` e `utm_medium=social`; 2.648 deles também tinham `fbc`. Portanto, a presença de FBC não é um critério válido para chamar um acesso de pago.

## Instagram, link da bio e atribuição

A classificação agora é compartilhada entre o script de navegador e o servidor. Os dados de origem ficam separados dos identificadores de correspondência do Meta.

| Evidência recebida | Classificação |
|---|---|
| `utm_medium=paid`, `paid_social`, `cpc` e equivalentes explícitos | Pago |
| `utm_medium=social`, `organic_social`, `organic`, `conteudo` e equivalentes explícitos | Orgânico |
| Conteúdo explicitamente marcado como `bio` ou `link_in_bio`, sem mídia conflitante | Orgânico |
| Somente `fbclid` | Origem Meta, mídia não determinada |
| Somente referência/navegador do Instagram | Instagram, mídia não determinada |
| Nenhuma campanha ou referência | Direto/sem origem; sem inferir pagamento |

Um `fbclid` real mantém seu conteúdo e capitalização ao formar `fbc`. A correção não transforma IDs, não cria um clique quando ele não existe e não apaga um identificador válido simplesmente porque a visita é orgânica. Cookies inválidos ou vencidos não são recuperados indefinidamente do armazenamento local.

Os eventos orgânicos continuam sendo enviados ao Pixel/CAPI. A separação pago/orgânico é a classificação da plataforma; o Meta aplica suas próprias regras e janelas de atribuição a anúncios. Não foi implementado um bloqueio de eventos orgânicos.

Para tornar a origem da bio inequívoca, use no destino:

```text
?utm_source=instagram&utm_medium=organic_social&utm_content=bio
```

Se a URL já contém `?`, acrescente os parâmetros com `&`. Nos anúncios, use `utm_medium=paid_social`, acompanhado da origem e dos identificadores de campanha/anúncio que desejar analisar. Macros não expandidas, como `{{site_source_name}}`, não são tratadas como uma origem real.

A orientação também está em **Configurações → Instalação do Tracker**. Não houve edição da bio na conta do Instagram: a plataforma não possui uma conexão que permita administrar essa conta.

A sessão de atribuição é separada por propriedade e expira em 30 minutos. A navegação interna preserva a origem para a conversão; uma nova entrada identificada, inclusive uma bio após um anúncio, substitui a campanha anterior. Não foram reescritas origens históricas sem evidência.

## Correções por etapa

| Etapa | Problema encontrado | Correção |
|---|---|---|
| Loader | Dependência de consulta de geolocalização antes de disparar eventos | Disparo inicial não aguarda serviço externo de geolocalização |
| Loader | Repetição do script podia duplicar listeners e eventos | Proteção contra inclusão repetida por propriedade |
| Pixel/CAPI | Parâmetros de `_tracker.send` não chegavam à CAPI | Valor, moeda, produtos e demais campos permitidos preservados no transporte |
| Pixel | `track` enviava a todos os pixels inicializados na página | `trackSingle`/`trackSingleCustom` direcionam ao pixel configurado |
| Pixel | Fire-once impedia reinicializar o Pixel após reload | Suprime os eventos iniciais repetidos, mantendo o Pixel pronto para conversões posteriores |
| Coleta | JSON sem validação e propriedade desativada ignorada | Validação de identidade, URL, timestamp, tamanho e configuração da propriedade |
| Coleta | IP fornecido pelo JSON podia divergir do transporte | Uso do IP dos headers do transporte; remoção do override do JSON |
| Coleta | Retentativas podiam inserir o mesmo evento várias vezes | Chave única para novas entradas, verificação de identidade e resposta idempotente |
| Fila | Processamento imediato e por lote sem reserva atômica | Reserva com `FOR UPDATE SKIP LOCKED`, lease e contador de tentativas |
| CAPI | Data de eventos com mais de sete dias era artificialmente alterada | Evento expirado não é enviado como se fosse recente |
| CAPI | Erro do Meta era apresentado como sucesso | Aceite exige resposta bem-sucedida com `events_received > 0` e sem erro |
| CAPI | Falhas temporárias sem recuperação confiável | Retentativas limitadas, intervalo crescente e cron a cada minuto |
| CAPI | Falha de um evento interrompia o lote | Tratamento por evento, timeout e concorrência limitada |
| CAPI | API fixada em `v19.0` | Uso de `v26.0`, com opção `META_API_VERSION` |
| Payload | Valores zero e IDs de produto inferidos de páginas genéricas | Removidos valores/preços e IDs de produto inventados; Purchase exige valor e moeda |
| Identificadores | Risco de normalização inconsistente ou hash duplo | Normalização por tipo e reconhecimento de SHA-256 já calculado |
| Painel | `processed=true` equivalia a “enviado” | Status baseado na resposta real, incluindo falha, expirado e sem confirmação |
| Painel | FBP era apresentado como prova de Pixel e deduplicação | Removida a confirmação indevida; recebimento do Pixel fica não verificado |
| Relatório | Todos os tipos de evento eram somados como acessos | Relatório de origem conta PageViews distintos por identidade de evento |
| Código antigo | Segundo snippet com pixel fixo e escrita direta pela chave pública | Gerador legado passa a usar o mesmo loader hospedado |

O relatório de origem mede visitas de página, não pessoas únicas. A contagem de visitantes por `external_id` é outra métrica.

## Segurança e estrutura

- `process-fb-event` não validava o chamador dentro da função, e sua configuração publicada permitia chamadas sem JWT. Agora somente a chave de serviço ou um usuário autenticado pode processar eventos. O mesmo controle foi aplicado à análise.
- A chave pública não consegue chamar a função de reserva da fila nem a RPC do relatório.
- Tabelas antigas `trackers`, `tracker_events` e `guru_webhooks` tinham permissões públicas. Essas permissões foram revogadas; o acesso de serviço usado pelas funções permanece.
- Policies públicas antigas de `properties` e `fb_events_raw` foram removidas. O acesso anônimo a essas duas tabelas já estava revogado por grants; agora não depende de manter policies permissivas sem grants.
- O cadastro público e os usuários anônimos do Supabase Auth estavam desabilitados. O modelo atual é de painel administrativo compartilhado entre usuários autenticados; não há isolamento de clientes por proprietário implementado nesta aplicação.
- Relatórios gerados pela função de análise passam a usar bucket privado e URLs temporárias.
- A credencial do cron fica no Supabase Vault. Não foi incluído token administrativo ou chave de serviço no código, no snippet ou no `.env` do frontend.
- Foram adicionados índices para identidade, fila e consulta por propriedade/data. As duplicatas antigas foram preservadas como histórico.
- As dependências de tipos ausentes foram instaladas. `package-lock.json` e `bun.lock` foram sincronizados.

Migrações aplicadas: `20260910220000_tracking_reliability.sql` e `20260910221000_meta_retry_schedule.sql`. A primeira foi validada dentro de uma transação revertida antes da aplicação definitiva.

## Validação executada

- **32 testes automatizados, 64 verificações, zero falhas.** Cobrem bio com fbclid, pago explícito, origem desconhecida, troca de campanha na sessão, duplicação do script, IDs Pixel/CAPI, parâmetros de compra, preço ausente, timestamps, hashing, autenticação, retentativas e ingestão.
- **TypeScript e build de produção aprovados.** O build ainda informa bundle JavaScript grande; isso é uma oportunidade de otimização de carregamento, não uma falha de envio CAPI.
- As quatro funções passaram pela compilação remota do Supabase antes de serem publicadas.
- Requisições sem token e com chave pública a `process-fb-event` e `analyze-events`: **401**. Preflight CORS do processador: **204**.
- Dois eventos foram enviados exclusivamente à propriedade **Teste**, após confirmar que ela já estava com `test_event_active=true` e código de teste configurado. Ambos retornaram **`events_received=1`**, com status **accepted**, na primeira tentativa.
- Um teste usou mídia orgânica; outro usou mídia paga. A base manteve as duas classificações distintas e os IDs enviados ao Meta iguais aos da coleta.
- Uma das requisições foi repetida simultaneamente: houve somente um registro para aquela identidade. Os testes não fabricaram `fbclid` para enviar ao Meta; esse caso é exercitado nos testes locais.
- A agenda `tyvo-meta-retry` está ativa. Não havia cron de recuperação configurado antes da correção.

Versões publicadas: loader **45**, track **8**, process-fb-event **59**, analyze-events **7**. Ao final, a agenda registrava **seis execuções bem-sucedidas**.

Foram inspecionadas oito páginas ativas nos domínios `biteti.co`, `diagnostico.carolmancur.com.br` e `diagnosticocolecao.biteti.co`. Todas carregavam o loader hospedado da propriedade correspondente. Em `diagnosticocolecao.biteti.co` também existe uma chamada customizada inline a `fbq('trackCustom', ...)`; isso exige considerar o código externo ao avaliar a cobertura dos eventos personalizados. A leitura do HTML não executou eventos de produção.

## Limites e ações externas

1. **Aceite pela CAPI não prova atribuição de anúncio, qualidade de correspondência ou deduplicação efetiva entre Pixel e CAPI no Meta.** Esses resultados precisam ser acompanhados em Test Events/Diagnóstico no Gerenciador de Eventos da conta Meta. Os testes verificam identidade consistente e recebimento pela API.
2. **O endereço da bio precisa estar marcado.** Sem UTM explícita, o identificador fbclid não resolve a distinção com certeza. Não há reconstrução confiável da origem dos registros antigos sem referência/UTMs.
3. **Eventos comerciais dependem da ação real.** O modo automático AddToCart existente reage ao clique na classe configurada, não à confirmação do sistema de carrinho. Em uma loja, chame `_tracker.send('AddToCart', dados)` após a confirmação da adição e desative o gatilho de clique para evitar contagem dupla. Purchase precisa ser integrado ao checkout e usar o valor/moeda reais. Não há integração autenticada de pedidos/catálogo neste repositório.
4. **Lead automático é voltado a formulários Elementor.** Formulários de outros provedores precisam acionar a API após confirmação de sucesso. Configurações de eventos escolhidas em cada propriedade não foram indiscriminadamente ligadas.
5. **Scripts de terceiros instalados nos sites continuam fora do controle deste repositório.** Um Pixel adicional, integração de checkout ou tag manual pode criar outros eventos com IDs distintos. Não foi removido código de sites externos nem alterada configuração de anúncios.
6. **Erros históricos e dados passados foram preservados.** Eventos expirados não foram reenviados, e valores/origens desconhecidos não foram inventados. O novo status do painel deixa de contar erros históricos como aceite.
7. **O painel remoto não foi publicado.** O backend corrigido já está ativo; as telas atualizadas estão em `http://localhost:3390` e no build local.

Referências primárias consultadas: [SDK oficial Meta — versão da API](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/api.js), [Parameter Builder oficial Meta](https://github.com/facebook/capi-param-builder), [API de gerenciamento Supabase](https://api.supabase.com/api/v1-json), [agendamento de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions). As páginas de documentação do Meta sobre parâmetros e deduplicação retornaram HTTP 429 durante a consulta; a validação de recebimento foi realizada diretamente pela CAPI em modo de teste.

## Segunda revisão completa — 10/09/2026, concluída após 00h UTC

### Erros adicionais corrigidos

- **Configurações e cache:** consultas com a mesma chave de cache retornavam formatos diferentes de propriedade. As quatro telas agora compartilham a consulta completa, resolvem seleção antiga inválida e não exibem eventos da propriedade anterior enquanto a próxima carrega. O cache é recriado ao trocar de usuário.
- **Salvamento:** atualizações passam somente os campos editados, em sequência, sem reenviar credenciais antigas. Alterações pendentes são enviadas ao sair da tela; falhas aparecem com opção de repetir. Pixel inválido é bloqueado antes da gravação. Criação, exclusão, login e logout tratam falhas sem deixar controles travados.
- **Exclusão auditada:** uma função transacional grava a auditoria e exclui a propriedade atomicamente. Foi exercitada com uma propriedade sintética dentro de uma transação revertida, verificando a remoção e a auditoria. Nenhuma propriedade real foi apagada.
- **Exibição:** datas históricas inválidas não derrubam a tela; timestamps de banco sem fuso são lidos como UTC; a prévia acrescenta o parâmetro antes do fragmento da URL e recusa esquemas executáveis. Payloads coletados não são mais apresentados como prova do que o Pixel enviou.
- **Coleta:** falhas do Pixel, bloqueio de armazenamento e ausência de criptografia não interrompem a coleta CAPI. Identificadores permanecem consistentes dentro da página. Campanhas novas substituem o conjunto anterior de UTMs, inclusive quando chegam incompletas, e mudanças de URL são reconhecidas.
- **Lead e Purchase:** sucesso de formulário sem envio anterior não gera Lead; os dados de formulários diferentes permanecem separados e notificações duplicadas de sucesso não repetem o evento. Purchase sem valor/moeda válidos é recusado nos dois canais.
- **Servidor:** objetos JSON inválidos, UUIDs malformados e corpos excessivos são recusados antes da gravação. O limite conta bytes UTF-8. Cache geográfico antigo é atualizado. Respostas Meta sem estrutura válida podem ser repetidas conforme o limite de tentativas.
- **Cron:** o status SQL `succeeded` ocultava HTTP **401** no processador. A chave legada do cron era válida no banco, mas diferia da chave do ambiente da função. A função agora verifica essa credencial pela assinatura e permissões do PostgREST, usando uma RPC sem acesso a dados, exclusiva de `service_role`. Ler o campo `role` do token nunca é suficiente para autorizar. A checagem HTTP substitui a suposição anterior baseada apenas no sucesso da agenda.

### Evidências da segunda revisão

- **50 testes de lógica e endpoints, 116 verificações, zero falhas.** Incluem autenticação legada, token falsificado, falha do verificador, bio/fbclid, sessão, formulários, payloads e idempotência.
- **11 cenários no Google Chrome, zero falhas**, com Supabase simulado: navegação entre telas, configurações completas, salvamento concorrente, erro de salvamento, Pixel inválido, ausência de propriedades, erro de consulta, prévia/datas, falha de login, isolamento de cache entre contas, saída da tela e recuperação de falha no logout.
- TypeScript e build de produção passaram. O aviso de bundle grande permanece; não é erro de compilação.
- As quatro funções passaram pela compilação remota. Versões finais: **loader 46, track 9, process-fb-event 61, analyze-events 9**.
- Migrações adicionais aplicadas: `20260911000000_atomic_property_deletion.sql` e `20260911001000_verify_service_request.sql`. Ambas passaram por validação com rollback antes da aplicação.
- Dois novos eventos `TyvoAudit`, exclusivamente na propriedade em modo de teste, foram aceitos pelo Meta na primeira tentativa (`events_received=1` cada). Origem orgânica e paga permaneceram distintas; três requisições, incluindo uma duplicada, produziram somente dois registros.
- Validação remota: JSON `null` retorna **400** nos três endpoints; corpo excessivo retorna **413**; UUID de loader inválido retorna **400**; método indevido retorna **405**; exclusão anônima retorna **401**. A RPC de validação de serviço não pode ser executada por usuários anônimos ou autenticados comuns.
- A chamada da agenda foi repetida via `pg_net`, com a própria credencial do Vault, e retornou **HTTP 200**, sem timeout. A fila não tinha eventos elegíveis naquele instante (`total=0`); as regras de recuperação e limites foram verificadas nos testes locais.

O backend está publicado. O painel atualizado está no servidor local da porta **3390** e em `dist`; não foi realizado deploy do frontend remoto. Continuam válidos os limites da seção anterior sobre atribuição no Meta, UTMs da bio, scripts externos e histórico.
