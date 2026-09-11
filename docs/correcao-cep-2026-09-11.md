# Correção de CEP e apresentação da localização — 11/09/2026

A consulta ao provedor `ipwho.is` confirmou que um dos exemplos da tela recebia `postal: "1002"` para um endereço IP brasileiro. As colunas `zip` do cache e dos eventos são do tipo texto: o valor já chegou incompleto do provedor. A localização por IP é uma estimativa; não equivale ao endereço informado pelo visitante.

O coletor valida o formato de CEP brasileiro antes de gravar novos eventos, incluindo respostas de cache. Só aceita oito dígitos, com hífen opcional, e preserva zeros à esquerda. Não completa dados ausentes com zeros. O cache mantém a resposta postal original para inspeção. Códigos postais internacionais mantêm letras, espaços e hífens.

O processador aplica a mesma validação antes de gerar o hash `zp` enviado à Meta, inclusive para eventos pendentes antigos. Um CEP incompleto é omitido desse campo de correspondência; os demais campos do evento continuam no envio. Não houve exclusão nem reescrita do histórico, nem repetição de eventos já aceitos para modificar seu payload.

No painel, um CEP antigo inválido aparece como “Indisponível”, com o valor original no tooltip. Um CEP brasileiro completo aparece como `11060-450`. A mesma formatação é usada no Codmov. Estado, cidade e cabeçalhos ficam em uma linha; IDs abreviados exibem o identificador completo no tooltip. Margens e alinhamento à esquerda são preservados.

Validação: 57 testes de lógica/endpoints aprovados, 144 verificações; cenário de navegador cobrindo CEP inválido, valor original, CEP formatado e identificadores completos aprovado. TypeScript, build do painel e bundles das funções passaram.

Funções publicadas: `track` versão 10 e `process-fb-event` versão 62, após validação de compilação remota.

Após a publicação, dois eventos enviados à propriedade já configurada em modo de teste foram aceitos pelo Meta na primeira tentativa (`events_received=1` cada), mantendo os IDs e as classificações orgânica/paga. A repetição simultânea de uma requisição não criou outro registro.

Referência do campo postal e do provedor: [documentação oficial IPWhois](https://ipwhois.io/documentation).
