# Instruções para agentes de IA (Antigravity, Gemini, Codex e outros)

Este projeto é o Mobiliza Pop. **Leia e siga o arquivo `CLAUDE.md`**: ele tem as regras editoriais obrigatórias e o mapa do projeto. As regras valem para qualquer IA, não só para o Claude.

Resumo do essencial:
- Edite só os arquivos em `site/data/*.json`, a não ser que a pessoa peça outra coisa. Se mexer na rede social (`site/api/`), rode `npm run testar` até passar.
- Sem fonte, não publica. Nunca invente números, nomes, datas, votos ou citações.
- Português correto e acentuado, arquivos em UTF-8.
- Marque com `"gerado_por_ia": true` o que você escrever.
- Depois de qualquer mudança, rode `node robo/validar.mjs` e corrija até passar.

Tarefas prontas (abra o arquivo e siga os passos):
- Boletim do dia: `.claude/skills/boletim-diario/SKILL.md` (rode `node robo/coletar.mjs` antes)
- Novo alerta de projeto de lei: `.claude/skills/novo-alerta/SKILL.md`
- Checagem de notícia: `.claude/skills/nova-checagem/SKILL.md`
- Revisão de português: `.claude/skills/revisar-texto/SKILL.md`
