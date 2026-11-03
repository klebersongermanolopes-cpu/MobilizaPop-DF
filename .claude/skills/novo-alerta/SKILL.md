---
name: novo-alerta
description: Cria um alerta de projeto de lei no site a partir do número ou do link oficial (Câmara, Senado ou e-Cidadania). Uso: /novo-alerta PL 1234/2026 ou /novo-alerta https://...
argument-hint: "[número do projeto ou link oficial]"
allowed-tools: Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, Bash(node robo/validar.mjs)
---

# Novo alerta

Projeto pedido: $ARGUMENTS

Siga as regras editoriais do `CLAUDE.md`.

## 1. Levantar os fatos (só fontes oficiais)

- Ache a página oficial do projeto: Câmara (`camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=...`), Senado (`www25.senado.leg.br/web/atividade/materias/-/materia/...`) e, se houver, a consulta pública no e-Cidadania.
- Para projeto da Câmara, a API ajuda: `https://dadosabertos.camara.leg.br/api/v2/proposicoes?siglaTipo=PL&numero=1234&ano=2026` devolve o `id`. Guarde esse id em `camara_id`, porque é com ele que o robô busca os votos nominais.
- Anote: número, ementa, autoria, casa, situação atual, link da consulta pública e placar, se houver.
- Se não encontrar a página oficial, **pare** e explique o que faltou. Não crie alerta com base só em mensagem de WhatsApp ou rede social.

## 2. Escrever o alerta

Adicione um objeto em `site/data/alertas.json > alertas` seguindo o formato do alerta `pl-3615-2019` que já existe. Pontos de atenção:

- `slug`: a partir do número, ex.: `pl-1234-2026`.
- `resumo`: uma frase de até 280 caracteres dizendo o que o projeto faz.
- `prioridade`: `alta` (votação próxima ou consulta aberta com risco), `media` ou `baixa`.
- `capitulos`:
  1. "O que é": o que o texto faz, em linguagem simples, baseado na ementa e no texto oficial.
  2. "Por que preocupa": o impacto na vida das pessoas. Se a preocupação vem de especialistas, entidades ou reportagens, **atribua** ("Segundo o Observatório do Clima, ..."). Se não achar fonte para o impacto, escreva só o que o texto muda e coloque uma `nota` pedindo que a equipe complete.
  3. "Placar" (`"tipo": "placar"`): só se houver consulta pública. Não repita os números no texto; o site já mostra o placar.
  4. "O que fazer" (`"tipo": "acao"`): o passo concreto (votar na consulta, cobrar parlamentares, comparecer a uma audiência).
- `mensagem_whatsapp`: até 5 linhas, com o link da ação e "Via Mobiliza Pop" no final.
- `mensagem_cobranca`: 1 ou 2 frases educadas pedindo a posição do parlamentar sobre o projeto.
- `fontes`: todos os links que você usou.
- `gerado_por_ia: true`, `atualizado_em` com a data de hoje.

Se houver prazo (fim da consulta, data de votação), adicione um evento em `site/data/agenda.json`.

## 3. Validar

Rode `node robo/validar.mjs` e corrija até passar. No fim, diga em poucas linhas o que você criou e o que a equipe precisa conferir.
