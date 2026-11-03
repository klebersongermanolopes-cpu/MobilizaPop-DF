// Robô de coleta do Mobiliza Pop. Não usa IA: só baixa dados públicos.
//
// O que ele faz:
//   1. Atualiza site/data/deputados.json e site/data/senadores.json (listas completas)
//   2. Atualiza site/data/votos.json com os votos da Câmara nos PLs em alerta (quando há camara_id)
//   3. Monta robo/pauta/pauta.json com projetos recentes e notícias por tema,
//      que a IA usa depois para escrever os rascunhos (skill /boletim-diario)
//
// Uso: node robo/coletar.mjs            (tudo)
//      node robo/coletar.mjs --so-parlamentares
import { resolve } from "node:path";
import { DADOS, PAUTA, RAIZ, lerJSON, salvarJSON, hoje, agora, diasAtras } from "./lib.mjs";
import * as camara from "./fontes/camara.mjs";
import * as senado from "./fontes/senado.mjs";
import { buscarNoticias } from "./fontes/noticias.mjs";

const soParlamentares = process.argv.includes("--so-parlamentares");
const config = await lerJSON(resolve(RAIZ, "robo", "config.json"));
const relatorio = [];
const anotar = (ok, texto) => { relatorio.push(`${ok ? "OK  " : "FALHOU"} ${texto}`); console.log(`${ok ? "✔" : "✘"} ${texto}`); };

// 1. Parlamentares. Só grava se a lista vier completa, para nunca apagar dados bons com uma resposta ruim.
async function atualizarCasa(nome, arquivo, buscar, minimo, fonte) {
  try {
    const lista = await buscar();
    if (lista.length < minimo) throw new Error(`lista com só ${lista.length} nomes (mínimo ${minimo})`);
    await salvarJSON(resolve(DADOS, arquivo), { atualizado_em: hoje(), fonte, amostra: false, parlamentares: lista });
    anotar(true, `${nome}: ${lista.length} parlamentares`);
  } catch (e) {
    anotar(false, `${nome}: ${e.message}. Arquivo anterior mantido.`);
  }
}

await atualizarCasa("Câmara", "deputados.json", camara.deputados, 400, "API Dados Abertos da Câmara dos Deputados");
await atualizarCasa("Senado", "senadores.json", senado.senadores, 70, "API Dados Abertos do Senado Federal");

// 2. Votos nos PLs em alerta que têm votação nominal na Câmara.
try {
  const { alertas = [] } = (await lerJSON(resolve(DADOS, "alertas.json"))) || {};
  const votos = {};
  for (const a of alertas.filter((x) => x.camara_id)) {
    const porDeputado = await camara.votosDaProposicao(a.camara_id, a.numero);
    for (const [id, lista] of Object.entries(porDeputado)) (votos[id] ||= []).push(...lista);
  }
  await salvarJSON(resolve(DADOS, "votos.json"), {
    atualizado_em: hoje(),
    observacao: "Votos nominais dos deputados nos PLs em alerta que já passaram por votação na Câmara. Preenchido pelo robô.",
    votos,
  });
  anotar(true, `Votos: ${Object.keys(votos).length} deputados com votos registrados`);
} catch (e) {
  anotar(false, `Votos: ${e.message}`);
}

// 3. Pauta para a IA.
if (!soParlamentares) {
  const pauta = { gerado_em: agora(), periodo: { inicio: diasAtras(config.dias_proposicoes), fim: hoje() }, proposicoes: [], noticias: [] };
  try {
    pauta.proposicoes = await camara.proposicoesRecentes({
      temas: config.temas, tipos: config.tipos_proposicao, inicio: pauta.periodo.inicio, fim: pauta.periodo.fim,
    });
    anotar(true, `Pauta: ${pauta.proposicoes.length} proposições recentes na Câmara`);
  } catch (e) {
    anotar(false, `Pauta (proposições): ${e.message}`);
  }
  for (const tema of config.temas) {
    try {
      const consulta = tema.palavras.map((p) => `"${p}"`).join(" OR ");
      const itens = await buscarNoticias(consulta, { dias: config.dias_noticias, max: config.max_noticias_por_tema });
      pauta.noticias.push(...itens.map((n) => ({ ...n, tema: tema.id })));
    } catch (e) {
      anotar(false, `Notícias (${tema.nome}): ${e.message}`);
    }
  }
  anotar(true, `Pauta: ${pauta.noticias.length} notícias`);
  pauta.checagens = [];
  for (const f of config.fontes_checagem || []) {
    try {
      const itens = await buscarNoticias(f.consulta, { dias: config.dias_checagens || 3, max: config.max_checagens_por_fonte || 6 });
      pauta.checagens.push(...itens.map((n) => ({ ...n, agencia: f.nome })));
    } catch (e) {
      anotar(false, `Checagens (${f.nome}): ${e.message}`);
    }
  }
  anotar(true, `Pauta: ${pauta.checagens.length} checagens de agências`);
  await salvarJSON(resolve(PAUTA, "pauta.json"), pauta);
}

console.log("\nResumo da coleta:\n" + relatorio.join("\n"));
