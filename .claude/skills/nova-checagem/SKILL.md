---
name: nova-checagem
description: Checa uma informação que está circulando e escreve a checagem para o site, com veredito e fontes oficiais. Uso: /nova-checagem "frase que está circulando"
argument-hint: "[frase ou print transcrito que está circulando]"
allowed-tools: Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, Bash(node robo/validar.mjs)
---

# Nova checagem

Informação a checar: $ARGUMENTS

Siga as regras editoriais do `CLAUDE.md`.

## 1. Investigar

- Identifique a afirmação central que dá para verificar (um número, uma lei, uma decisão, uma fala).
- Procure a fonte primária: Diário Oficial, planalto.gov.br, páginas oficiais da Câmara, do Senado, do TSE, do STF, do IBGE, de ministérios. Depois, agências de checagem e veículos jornalísticos (Lupa, Aos Fatos, Agência Pública, g1 Fato ou Fake, Estadão Verifica).
- Guarde os links que você realmente abriu e leu.

## 2. Decidir o veredito

- `falso`: a fonte oficial contradiz a afirmação.
- `enganoso`: tem parte verdadeira, mas está fora de contexto, exagerada ou com dado distorcido.
- `verdadeiro`: a fonte oficial confirma.

Se não achar fonte confiável para decidir, **não crie a checagem**. Explique o que encontrou e o que falta. Uma checagem sem fonte é pior que nenhuma.

## 3. Escrever

Adicione no início de `site/data/checagens.json > checagens`:

```json
{
  "id": "slug-curto-do-assunto",
  "veredito": "falso",
  "titulo": "Até 90 caracteres, dizendo o que é verdade",
  "circula": "A frase que circula, entre aspas, como as pessoas estão compartilhando",
  "verdade": "2 a 4 frases simples com o fato e o contexto",
  "data": "AAAA-MM-DD",
  "gerado_por_ia": true,
  "fontes": [{ "nome": "Nome da fonte", "url": "https://..." }]
}
```

Remova as checagens com `"modelo": true` quando houver pelo menos uma checagem real.

## 4. Validar

Rode `node robo/validar.mjs` e corrija até passar. No fim, resuma o veredito e diga o que a equipe deve conferir.
