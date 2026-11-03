// Câmara dos Deputados: API Dados Abertos (https://dadosabertos.camara.leg.br/swagger/api.html)
import { baixar, limpar, esperar } from "../lib.mjs";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";

export function paraDeputado(d) {
  return {
    id: String(d.id),
    nome: limpar(d.nome),
    partido: limpar(d.siglaPartido),
    uf: limpar(d.siglaUf),
    email: d.email ? limpar(d.email) : null,
    foto: d.urlFoto ? String(d.urlFoto).replace(/^http:/, "https:") : null,
    url: `https://www.camara.leg.br/deputados/${d.id}`,
  };
}

export function proximaPagina(links = []) {
  const prox = links.find((l) => l.rel === "next");
  return prox ? prox.href : null;
}

async function paginar(url, limite = 20) {
  const itens = [];
  let atual = url;
  for (let i = 0; atual && i < limite; i++) {
    const r = await baixar(atual);
    itens.push(...(r.dados || []));
    atual = proximaPagina(r.links);
    if (atual) await esperar(300);
  }
  return itens;
}

export async function deputados() {
  const brutos = await paginar(`${BASE}/deputados?ordem=ASC&ordenarPor=nome&itens=100`);
  const vistos = new Set();
  return brutos.map(paraDeputado).filter((d) => !vistos.has(d.id) && vistos.add(d.id));
}

export function paraProposicao(p, tema) {
  return {
    id: String(p.id),
    numero: `${p.siglaTipo} ${p.numero}/${p.ano}`,
    ementa: limpar(p.ementa),
    casa: "Câmara dos Deputados",
    url: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${p.id}`,
    temas: tema ? [tema] : [],
  };
}

// Proposições apresentadas no período que batem com as palavras de cada tema.
export async function proposicoesRecentes({ temas, tipos, inicio, fim }) {
  const porId = new Map();
  let buscas = 0, falhas = 0;
  for (const tema of temas) {
    for (const palavra of tema.palavras) {
      const url = `${BASE}/proposicoes?siglaTipo=${tipos.join(",")}&dataApresentacaoInicio=${inicio}&dataApresentacaoFim=${fim}` +
        `&keywords=${encodeURIComponent(palavra)}&ordem=DESC&ordenarPor=id&itens=100`;
      buscas++;
      try {
        const lista = await paginar(url, 3);
        for (const p of lista) {
          const atual = porId.get(String(p.id));
          if (atual) { if (!atual.temas.includes(tema.id)) atual.temas.push(tema.id); }
          else porId.set(String(p.id), paraProposicao(p, tema.id));
        }
      } catch (e) {
        falhas++;
        console.warn(`  aviso: busca "${palavra}" falhou (${e.message})`);
      }
      await esperar(250);
    }
  }
  if (buscas && falhas === buscas) throw new Error("nenhuma busca de proposições funcionou");
  return [...porId.values()];
}

// Votos nominais em plenário de uma proposição: { idDeputado: [{numero, voto, data}] }
export async function votosDaProposicao(idProposicao, numero) {
  const resultado = {};
  const votacoes = (await baixar(`${BASE}/proposicoes/${idProposicao}/votacoes`)).dados || [];
  for (const v of votacoes.filter((x) => x.siglaOrgao === "PLEN")) {
    let votos = [];
    try { votos = (await baixar(`${BASE}/votacoes/${encodeURIComponent(v.id)}/votos`)).dados || []; }
    catch { continue; }
    for (const voto of votos) {
      const id = String(voto.deputado_?.id ?? "");
      if (!id) continue;
      (resultado[id] ||= []).push({ numero, voto: limpar(voto.tipoVoto), data: String(v.data || "").slice(0, 10) });
    }
    await esperar(300);
  }
  return resultado;
}
