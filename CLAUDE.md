# Mobiliza Pop

Portal de notícias independente, checagem e mobilização popular. Público: gente comum, no celular, sem tempo e sem paciência para juridiquês. Tudo que for publicado precisa ser verdadeiro, ter fonte e ser fácil de entender.

## Como o projeto está organizado

- `site/`: o site publicado na Hostinger (HTML, CSS e JS puros, sem build). Abre com `npm run site` em http://localhost:8080 (só o portal) ou `npm run rede-local` (portal + rede social, precisa de PHP)
- `site/api/`: API da rede social em PHP 8 + MySQL (login Google, posts, stories, reels, eventos, mapa, denúncias, moderação). **Depois de mexer aqui, rode `npm run testar` e corrija até passar.**
- `site/assets/js/rede.js` e `site/assets/css/rede.css`: telas da rede (feed, mapa, eventos, perfil)
- `site/painel/`: painel da equipe (fila de aprovação, denúncias, pessoas, publicações oficiais, registro)
- `banco/schema.sql`: estrutura do banco MySQL. `banco/config.exemplo.php`: modelo da configuração do servidor (o arquivo real nunca entra no Git)
- `testes/api.test.mjs`: testes automáticos da API
- `site/data/*.json`: todo o conteúdo do site. **A IA só edita estes arquivos**, nunca o HTML, CSS ou JS, a não ser que a pessoa peça explicitamente.
  - `alertas.json`: projetos de lei em alerta (cada um vira uma página `#slug`)
  - `checagens.json`, `agenda.json`, `boletim.json`
  - `deputados.json`, `senadores.json`, `votos.json`: preenchidos pelo robô, não editar à mão
  - `config.json`: links do Instagram, canal do WhatsApp e e-mail
- `robo/coletar.mjs`: baixa dados públicos (Câmara, Senado, Google Notícias) e gera `robo/pauta/pauta.json`
- `robo/validar.mjs`: confere o conteúdo. **Rode `node robo/validar.mjs` depois de qualquer edição em `site/data/` e corrija até passar.**
- `.claude/skills/`: tarefas prontas (`/boletim-diario`, `/novo-alerta`, `/nova-checagem`, `/revisar-texto`)

## Regras editoriais (obrigatórias)

1. **Sem fonte, não publica.** Todo fato precisa de link para a fonte (de preferência oficial: camara.leg.br, senado.leg.br, planalto.gov.br, tse.jus.br, ou veículo jornalístico). Nunca invente números, datas, nomes, votos ou citações.
2. **Escreva só o que a fonte diz.** Se não leu o texto completo, escreva só o que o título ou a ementa sustentam. Opinião ou interpretação de terceiros vai atribuída: "Segundo a Agência Senado, ...".
3. **Investigado, denunciado e condenado são coisas diferentes.** Use o termo exato do documento. Nunca chame de criminoso quem não foi condenado.
4. **Linguagem simples.** Frases curtas, voz ativa, sem juridiquês ("PL" pode, mas explique o que muda na vida das pessoas). Trate o leitor por "você".
5. **Tom firme, sem ofensa.** Pode ser combativo contra projetos e práticas; não use xingamentos, apelidos ou ataques pessoais.
6. **Português correto e acentuado.** Arquivos em UTF-8. Use acentos e cedilha normalmente (ação, não "acao"). Nunca use entidades HTML (`&amp;`) dentro do JSON. O validador barra texto corrompido.
7. **Marque o que a IA escreveu.** Todo item criado ou reescrito por IA leva `"gerado_por_ia": true`. Quem tira essa marca é a pessoa revisora, se quiser.
8. **Rascunho não é publicação.** A IA nunca publica direto: as mudanças vão para revisão (pull request) e uma pessoa da equipe aprova.
9. **Na dúvida, não publique.** Prefira deixar de fora e explicar no relatório do que arriscar uma informação errada.
10. **Rede social: segurança primeiro.** Nunca enfraqueça CSRF, limites de envio, filtro de moderação, verificação de idade ou permissões de papel sem pedido explícito. Toda consulta ao banco usa parâmetros (`q()`, `um()`, `todos()`), nunca texto concatenado com dado vindo do usuário.

## Formato dos dados

- Datas: `AAAA-MM-DD`. Data e hora: `AAAA-MM-DDTHH:MM:SS-03:00` (horário de Brasília).
- Links: sempre `https://`.
- `slug` de alerta: minúsculas, números e hífen, a partir do número do projeto (ex.: `pl-3615-2019`).
- Capítulos de alerta: 3 ou 4, nesta ordem: "O que é", "Por que preocupa", "Placar" (`"tipo": "placar"`, só se houver consulta pública), "O que fazer" (`"tipo": "acao"`).
- Limites de tamanho: veja `robo/validar.mjs`. Títulos curtos (até ~90 caracteres) funcionam melhor no celular.

## Comandos

- `npm run site`: ver o site no computador
- `npm run coletar`: rodar o robô de coleta
- `npm run validar`: conferir o conteúdo
- `npm run testar`: testes do robô e da API da rede (precisa de PHP)
- `npm run rede-local`: rede social no computador com banco de demonstração
