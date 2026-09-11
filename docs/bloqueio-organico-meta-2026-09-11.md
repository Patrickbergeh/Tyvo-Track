# Exclusão de orgânico, bio e ManyChat no Meta — 11/09/2026

A regra anterior classificava orgânico e pago, mas enviava ambos. Por solicitação do usuário, o rastreador agora bloqueia o envio ao Meta de visitas identificadas como orgânicas, bio ou ManyChat, mantendo seus eventos na plataforma.

## Regra e abrangência

- Orgânico: mídias explícitas como `social`, `organic_social`, `organic`, `orgânico`, `conteudo` e `bio`.
- Bio: marcadores explícitos de bio/link da bio nos campos UTM de origem, mídia ou conteúdo.
- ManyChat: marcador ManyChat nas UTMs ou referência do domínio ManyChat. A exclusão solicitada de ManyChat também prevalece se o link trouxer mídia paga.
- A regra vale para PageView, ViewContent, Lead, carrinho, Purchase e eventos personalizados dessas visitas.
- A sessão preserva a identificação na navegação interna, inclusive quando um link carrega o mesmo `fbclid` da entrada. Uma nova campanha explícita substitui a atribuição anterior.
- `fbclid`, referência do Instagram ou navegador interno, isoladamente, não identificam bio ou ManyChat. Tráfego pago explícito e tráfego desconhecido sem marcador de exclusão continuam elegíveis. Não foi implementada uma regra de “somente pago”.

Exemplo para a bio:

```text
?utm_source=instagram&utm_medium=organic_social&utm_content=bio
```

Exemplo para links enviados pelo ManyChat:

```text
?utm_source=instagram&utm_medium=organic_social&utm_content=manychat
```

Use `&` para acrescentar parâmetros a uma URL que já contenha `?`. Links sem identificação precisam ser marcados no destino; o acesso a um navegador Instagram não revela qual automação originou o clique.

## Bloqueio e auditoria

O loader não inicializa nem dispara o Pixel para essas visitas. Os eventos seguem para o coletor da plataforma, com a declaração de bloqueio do navegador. O servidor recalcula a regra a partir dos dados de origem e grava `delivery_status=skipped`, `processed=true` e o motivo da exclusão, antes de acionar a CAPI. O processador também verifica a regra antes de qualquer nova tentativa, protegendo eventos pendentes de loaders antigos e o cron.

A lista usa o resultado gravado, sem inferir “não enviado” apenas da origem:

| Estado registrado | Apresentação |
| --- | --- |
| Bloqueado antes da CAPI e bloqueio do Pixel declarado pelo loader | Não enviado · orgânico/bio/ManyChat |
| CAPI bloqueada, sem confirmação do comportamento do navegador antigo | CAPI bloqueada · motivo |
| Tentativa anterior existente e novos envios bloqueados | Reenvio bloqueado · motivo |
| Aceite do Meta já registrado | Aceito pelo Meta |

O tooltip e os detalhes explicam o alcance do bloqueio. A declaração do loader não comprova o comportamento de outros scripts instalados no site. Eventos históricos aceitos não foram apagados, reclassificados como não enviados nem repetidos. Um bloqueio atual não retira eventos que o Meta já recebeu.

## Verificação

- 68 testes de lógica/endpoints e 208 verificações aprovados, incluindo todos os canais do rastreador, trocas de campanha, navegação com `fbclid`, origens falsas e bloqueio do reprocessamento.
- Dois cenários de Chrome aprovados para a lista: status de exclusão persistido e preservação do aceite histórico; ausência de confirmação de Pixel em eventos de loader antigo.
- TypeScript, build do painel e compilação das funções aprovados.
- Chrome executando o loader publicado: três visitas excluídas produziram seis eventos coletados e zero requisições ao Meta. Uma visita paga produziu dois eventos com IDs Pixel/coletor iguais; o tráfego do Pixel de teste foi interceptado.
- Os oito eventos foram submetidos exclusivamente à propriedade já configurada em modo de teste: seis registros ficaram `skipped`, com `attempt_count=0` e `payload_sent=null`; os dois pagos foram aceitos pela CAPI (`events_received=1`). Uma repetição de requisição não duplicou o registro.
- Reprocessamento manual dos seis excluídos retornou zero registros elegíveis.
- A loja Yvenon foi consultada novamente e já carrega o loader Supabase da propriedade correta.

Versões publicadas: loader 48, track 11, process-fb-event 63 e analyze-events 10. A regra foi publicada primeiro no servidor e depois no loader. O código do painel segue no repositório para publicação do frontend.

Contexto do ManyChat: [documentação oficial do gatilho de referência do Instagram](https://help.manychat.com/hc/en-us/articles/14281276006684-Instagram-Ref-URL-Trigger).
