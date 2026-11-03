---
name: boletim-diario
description: Escreve a edição do boletim do dia a partir da pauta coletada pelo robô, atualiza o placar das consultas públicas e sugere novos alertas. Use depois de rodar `node robo/coletar.mjs`.
allowed-tools: Read, Write, Edit, Glob, Grep, WebFetch, Bash(node robo/validar.mjs)
---

# Boletim diário

Siga as regras editoriais do `CLAUDE.md`. Você está escrevendo **rascunhos** que uma pessoa vai revisar.

## 1. Ler a pauta

Leia `robo/pauta/pauta.json` (gerado por `node robo/coletar.mjs`). Ele tem:
- `proposicoes`: projetos apresentados na Câmara nos últimos dias, com tema, ementa e link
- `noticias`: manchetes do Google Notícias por tema, com link e veículo

Leia também `site/data/alertas.json`, `site/data/boletim.json` e `site/data/agenda.json`.

Se a pauta não existir ou estiver vazia (sem notícias e sem proposições), **não crie edição**. Escreva só o relatório (passo 7) explicando que a coleta não trouxe nada.

## 2. Atualizar o placar das consultas

Para cada alerta com `consulta.url`, abra a página com WebFetch e procure os totais de votos SIM e NÃO.
- Só atualize `consulta.sim`, `consulta.nao` e `consulta.apurado_em` se os dois números aparecerem claramente na página. Use a data e hora mostradas na página; se não houver, use o horário atual de Brasília.
- Se o lado que lidera mudou, ajuste também `mensagem_whatsapp` e o título do capítulo `"tipo": "placar"`.
- Atualize `atualizado_em` do alerta.
- Se não conseguir ler a página, não mexa nos números e registre no relatório.

## 3. Escolher o que entra no boletim

Escolha de 3 a 6 itens, nesta prioridade:
1. Alertas ativos com novidade (placar, votação marcada, mudança de situação)
2. Notícias da pauta ligadas aos temas monitorados que afetam direitos da população
3. Datas da agenda dos próximos 7 dias

Descarte notícia repetida (mesmo fato em veículos diferentes: fique com a fonte mais confiável), notícia sem link e boato.

## 4. Escrever a edição

Adicione **no início** de `site/data/boletim.json > edicoes` uma edição assim:

```json
{
  "id": "AAAA-MM-DD-manha",
  "data": "AAAA-MM-DD",
  "hora": "8h",
  "exemplo": false,
  "gerado_por_ia": true,
  "manchete": "Frase curta com o fato mais importante do dia",
  "itens": [
    { "tipo": "alerta", "titulo": "...", "texto": "...", "url": "https://...", "fonte": "e-Cidadania" },
    { "tipo": "noticia", "titulo": "...", "texto": "...", "url": "https://...", "fonte": "Nome do veículo" }
  ]
}
```

- `id`: data mais `-manha` (antes das 13h) ou `-tarde`. Se o id já existir, substitua aquela edição.
- `titulo`: com suas palavras, até 90 caracteres. Não copie a manchete do jornal.
- `texto`: 1 ou 2 frases, só com o que a fonte sustenta. Se precisar de detalhe que não está no título, abra o link com WebFetch; se não conseguir abrir, fique no que o título diz.
- `tipo`: `alerta`, `noticia`, `agenda` ou `checagem`.
- Remova as edições com `"exemplo": true`. Mantenha no máximo 30 edições (apague as mais antigas).
- Atualize `atualizado_em` do arquivo.

## 5. Checagens das agências

Olhe `pauta.checagens` (títulos publicados por agências profissionais de checagem: Aos Fatos, Lupa, g1 Fato ou Fake, Estadão Verifica, UOL Confere).
- Só use as que têm **veredito claro no próprio título** (ex.: "É falso que...", "#FAKE", "Vídeo engana ao..."). Na dúvida, deixe de fora.
- Para cada uma, adicione no início de `site/data/checagens.json > checagens` um item no formato da skill `/nova-checagem`, com `"gerado_por_ia": true`, atribuindo a conclusão à agência ("Segundo o Aos Fatos, ...") e com o link exato da agência em `fontes`.
- Não repita link que já está no arquivo. Não acrescente fatos que não estejam no título ou na página da agência. Mantenha no máximo 40 checagens.
- Remova os itens com `"modelo": true` quando entrar a primeira checagem real.

## 6. Sugerir novos alertas (não publicar)

Olhe `pauta.proposicoes`. Se algum projeto parece ameaçar direitos nos temas monitorados, **não crie o alerta**. Liste no relatório: número, ementa, link e uma frase dizendo por que merece atenção. A equipe decide e roda `/novo-alerta` depois.

## 7. Validar e relatar

1. Rode `node robo/validar.mjs` e corrija até passar.
2. Escreva `robo/pauta/relatorio.md` em português, curto, para a pessoa revisora:
   - O que mudou (edição criada, placares atualizados)
   - O que conferir com atenção (qualquer item em que você teve dúvida)
   - Sugestões de novos alertas
   - O que falhou (páginas que não abriram)
