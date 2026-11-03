---
name: revisar-texto
description: Revisa o português de todo o conteúdo do site (acentos, ortografia, caracteres corrompidos, clareza) sem mudar fatos, números ou links.
allowed-tools: Read, Edit, Glob, Grep, Bash(node robo/validar.mjs)
---

# Revisar texto

Revise o texto visível do site:
- `site/data/alertas.json`, `checagens.json`, `agenda.json`, `boletim.json`, `config.json`
- O texto visível de `site/index.html` (títulos, parágrafos, botões). Não mexa em código, classes ou atributos.

## O que corrigir

- Acentos e cedilha faltando ou errados ("acao" → "ação", "voce" → "você").
- Caracteres corrompidos ("Ã§" → "ç", "Ã£" → "ã", "â€œ" → aspas). O validador aponta onde estão.
- Erros de ortografia, concordância e pontuação.
- Frases longas demais: quebre em duas quando passar de ~25 palavras.
- Juridiquês: troque por palavras do dia a dia, sem mudar o sentido.
- Padronização: "e-Cidadania", "WhatsApp", "Câmara dos Deputados", "Senado Federal", números com ponto de milhar (14.388).

## O que NÃO mudar

- Fatos, números, datas, nomes de pessoas, links e o veredito das checagens.
- Os campos `slug`, `id`, `tipo`, `veredito`, `prioridade` e as chaves do JSON.
- Os arquivos preenchidos pelo robô: `deputados.json`, `senadores.json` e `votos.json`.

## No fim

Rode `node robo/validar.mjs` e corrija até passar. Liste as mudanças feitas (antes → depois), agrupadas por arquivo.
