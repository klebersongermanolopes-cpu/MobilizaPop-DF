// Escritor do boletim usando o Gemini (Google). Alternativa à skill /boletim-diario do Claude Code.
//
// Diferente de um agente solto, este script controla tudo:
//   - entrega ao Gemini só a pauta coletada (títulos, links, veículos);
//   - aceita de volta apenas itens cujo link veio da pauta ou dos alertas (a IA não consegue inventar fonte);
//   - atualiza o placar das consultas só se os números novos forem coerentes (votos só aumentam);
//   - grava o boletim, roda as regras do validador e escreve o relatório para a equipe revisar.
//
// Uso: GEMINI_API_KEY=... node robo/escrever-ia.mjs
//      Opcional: GEMINI_MODEL (modelo preferido; se falhar, tenta os da lista MODELOS)
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { DADOS, PAUTA, lerJSON, salvarJSON, hoje, agora, baixar, esperar, limpar } from "./lib.mjs";

// Modelos tentados em ordem. Se um não existir ou não responder, passa para o próximo.
const MODELOS = [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-flash-latest"].filter(Boolean))];
let modeloAtual = 0;
const nomeModelo = () => MODELOS[modeloAtual] || MODELOS[MODELOS.length - 1];
const MAX_EDICOES = 30;
const TIPOS = ["alerta", "noticia", "agenda", "checagem"];

/* ---------- Gemini ---------- */
export function lerRespostaGemini(json) {
  const texto = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!texto) throw new Error("o Gemini não devolveu texto" + (json?.promptFeedback?.blockReason ? ` (bloqueado: ${json.promptFeedback.blockReason})` : ""));
  const limpo = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(limpo);
}

async function chamarModelo(modelo, sistema, pedido, chave) {
  const ctrl = new AbortController();
  const limite = setTimeout(() => ctrl.abort(), 60_000); // no máximo 60 segundos por tentativa
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: "user", parts: [{ text: pedido }] }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(`HTTP ${r.status}: ${json?.error?.message || "erro desconhecido"}`);
      e.status = r.status;
      throw e;
    }
    return lerRespostaGemini(json);
  } catch (e) {
    if (e.name === "AbortError") { const t = new Error("não respondeu em 60 segundos"); t.status = "tempo"; throw t; }
    throw e;
  } finally {
    clearTimeout(limite);
  }
}

// Tenta o modelo atual; em limite de uso (429) ou instabilidade (5xx) espera e repete uma vez;
// se o modelo não existir, travar ou falhar de outro jeito, passa para o próximo da lista.
async function perguntarGemini(sistema, pedido, chave, etapa = "pedido") {
  let erro;
  while (modeloAtual < MODELOS.length) {
    const modelo = MODELOS[modeloAtual];
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const inicio = Date.now();
      console.log(`  → ${modelo} (${etapa}), tentativa ${tentativa}...`);
      try {
        const resposta = await chamarModelo(modelo, sistema, pedido, chave);
        console.log(`  ✔ respondeu em ${Math.round((Date.now() - inicio) / 1000)}s`);
        return resposta;
      } catch (e) {
        erro = e;
        console.log(`  ✘ ${e.message}`);
        if (e.status === 401 || e.status === 403) throw new Error(`a chave GEMINI_API_KEY foi recusada (${e.message})`);
        const repetir = e.status === 429 || (typeof e.status === "number" && e.status >= 500);
        if (!repetir) break;
        await esperar(e.status === 429 ? 20_000 : 5_000);
      }
    }
    modeloAtual++;
    if (modeloAtual < MODELOS.length) console.log(`  ↪ trocando para ${MODELOS[modeloAtual]}`);
  }
  modeloAtual = MODELOS.length - 1;
  throw erro || new Error("nenhum modelo do Gemini respondeu");
}

// Veredito tirado do próprio título da agência (não da IA). Sem veredito claro no título, a checagem fica de fora.
export function vereditoDoTitulo(titulo) {
  const t = String(titulo || "").toLowerCase().replace(/fato ou fake/g, " ");
  if (/(é falso|falso que|não é verdade|nao e verdade|é mentira|#fake|\bfake\b|vídeo falso|imagem falsa|foto falsa|montagem)/.test(t)) return "falso";
  if (/(enganos|de contexto|distorc|exagera|não é bem assim|sem provas)/.test(t)) return "enganoso";
  if (/(é verdade|é verdadeiro|#fato\b|é real|confirmad)/.test(t)) return "verdadeiro";
  return null;
}

export function slugChecagem(url, data) {
  let h = 0;
  for (const c of String(url)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${data}-${h.toString(36)}`;
}

// Junta checagens novas às existentes: sem repetir link, apaga os modelos e guarda no máximo 40.
export function aplicarChecagens(arquivo, novas) {
  const reais = (arquivo?.checagens || []).filter((c) => !c.modelo);
  const vistos = new Set(reais.flatMap((c) => (c.fontes || []).map((f) => f.url)));
  const entram = novas.filter((c) => !vistos.has(c.fontes[0].url));
  const lista = [...entram, ...reais];
  if (!lista.length) return { arquivo: arquivo, entraram: 0 };
  return { arquivo: { atualizado_em: entram[0]?.data || arquivo?.atualizado_em, checagens: lista.slice(0, 40) }, entraram: entram.length };
}

// Lê o placar direto do texto da página do e-Cidadania, sem IA.
export function lerPlacarDaPagina(texto) {
  const num = (s) => Number(String(s).replace(/\./g, ""));
  const achar = (rotulo) => {
    const m = new RegExp(`\\b${rotulo}\\b[^\\d]{0,25}?(\\d{1,3}(?:\\.\\d{3})+|\\d+)`).exec(texto);
    return m ? num(m[1]) : null;
  };
  const sim = achar("SIM");
  const nao = achar("N[ÃA]O");
  const d = /(\d{2})\/(\d{2})\/(\d{4}),?\s*(?:às\s*)?(\d{2}):(\d{2})/.exec(texto);
  return { sim, nao, apurado_em: d ? `${d[3]}-${d[2]}-${d[1]}T${d[4]}:${d[5]}` : null };
}

/* ---------- regras de segurança (funções puras, testadas) ---------- */
const corta = (s, max) => { const t = limpar(s); return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t; };

// Mantém só itens válidos e com link conhecido. Itens de agenda e alerta podem vir sem link.
export function filtrarEdicao(resposta, linksPermitidos) {
  const descartados = [];
  const itens = [];
  for (const it of Array.isArray(resposta?.itens) ? resposta.itens : []) {
    const tipo = TIPOS.includes(it?.tipo) ? it.tipo : null;
    const url = it?.url ? String(it.url).trim() : null;
    const titulo = corta(it?.titulo, 110);
    const texto = corta(it?.texto, 400);
    if (!tipo || !titulo || !texto) { descartados.push(`item incompleto: ${titulo || "(sem título)"}`); continue; }
    if (url && !linksPermitidos.has(url)) { descartados.push(`link fora da pauta: ${url}`); continue; }
    if (!url && (tipo === "noticia" || tipo === "checagem")) { descartados.push(`notícia sem link: ${titulo}`); continue; }
    itens.push({ tipo, titulo, texto, url, fonte: it?.fonte ? corta(it.fonte, 60) : null });
    if (itens.length === 6) break;
  }
  const manchete = corta(resposta?.manchete, 120);
  return { manchete, itens, descartados };
}

export function idEdicao(dataHoraISO) {
  const hora = Number(dataHoraISO.slice(11, 13));
  return { id: `${dataHoraISO.slice(0, 10)}-${hora < 13 ? "manha" : "tarde"}`, hora: `${hora}h` };
}

export function aplicarEdicao(boletim, edicao) {
  const edicoes = (boletim?.edicoes || []).filter((e) => !e.exemplo && e.id !== edicao.id);
  return { atualizado_em: edicao.data, edicoes: [edicao, ...edicoes].slice(0, MAX_EDICOES) };
}

// Votos de consulta só aumentam: número menor ou absurdo é descartado.
export function placarCoerente(antigo, novo) {
  if (!novo || !Number.isInteger(novo.sim) || !Number.isInteger(novo.nao)) return false;
  if (novo.sim < (antigo?.sim || 0) || novo.nao < (antigo?.nao || 0)) return false;
  if (novo.sim + novo.nao > 50_000_000) return false;
  return true;
}

function textoDaPagina(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 20000);
}

/* ---------- execução ---------- */
const SISTEMA = `Você escreve rascunhos para o Mobiliza Pop, portal independente de notícias e mobilização popular.
Regras obrigatórias:
- Use SOMENTE as informações fornecidas. Não invente fatos, números, nomes, datas ou citações.
- Cada item de notícia deve usar exatamente um link da lista fornecida, sem alterar o endereço.
- Escreva com suas palavras, em português do Brasil correto e acentuado, frases curtas, linguagem simples, tratando o leitor por "você".
- Tom firme e sem ofensas. Nada de xingamentos ou apelidos.
- Investigado, denunciado e condenado são coisas diferentes: use o termo que a fonte usa.
- Se a informação não for suficiente, deixe o item de fora.
Responda apenas com JSON válido.`;

async function principal() {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) { console.error("✘ Falta a variável GEMINI_API_KEY."); process.exit(1); }

  const relatorio = { mudou: [], conferir: [], sugestoes: [], falhou: [] };
  const pauta = await lerJSON(resolve(PAUTA, "pauta.json"));
  const alertasArq = await lerJSON(resolve(DADOS, "alertas.json"), { alertas: [] });
  const agenda = await lerJSON(resolve(DADOS, "agenda.json"), { eventos: [] });
  const boletim = await lerJSON(resolve(DADOS, "boletim.json"), { edicoes: [] });
  const agoraBR = agora();

  // 1. Placar das consultas públicas
  console.log(`Modelos na ordem: ${MODELOS.join(", ")}`);
  console.log("1/4 Atualizando placar das consultas públicas");
  for (const a of alertasArq.alertas.filter((x) => x.consulta?.url)) {
    try {
      const pagina = textoDaPagina(await baixar(a.consulta.url, { tipo: "texto" }));
      let r = lerPlacarDaPagina(pagina);
      if (placarCoerente(a.consulta, r)) console.log(`  ✔ placar lido direto da página: SIM ${r.sim} × NÃO ${r.nao}`);
      else {
      const pos = Math.max(0, pagina.search(/\bSIM\b/));
      r = await perguntarGemini(
        "Você extrai números de páginas oficiais. Responda só com JSON.",
        `Na página da consulta pública abaixo, encontre o total de votos SIM e o total de votos NÃO.
Responda {"sim": número inteiro, "nao": número inteiro, "apurado_em": "data e hora mostrada na página, se houver, no formato AAAA-MM-DDTHH:MM"} ou {"sim": null, "nao": null} se não encontrar.

PÁGINA:
${pagina.slice(Math.max(0, pos - 1500), pos + 1500)}`, chave, `placar ${a.numero}`);
      }
      if (placarCoerente(a.consulta, r)) {
        const mudou = r.sim !== a.consulta.sim || r.nao !== a.consulta.nao;
        a.consulta.sim = r.sim;
        a.consulta.nao = r.nao;
        a.consulta.apurado_em = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(r.apurado_em || "") ? r.apurado_em.slice(0, 16) + ":00-03:00" : agoraBR;
        a.atualizado_em = hoje();
        if (mudou) relatorio.mudou.push(`Placar de ${a.numero}: SIM ${r.sim.toLocaleString("pt-BR")} × NÃO ${r.nao.toLocaleString("pt-BR")}`);
        const lider = r.nao >= r.sim ? "NÃO" : "SIM";
        if (!(a.mensagem_whatsapp || "").includes(`O ${lider} está na frente`)) {
          relatorio.conferir.push(`${a.numero}: agora o ${lider} lidera. Confira se a mensagem de WhatsApp e o título do capítulo "Placar" ainda fazem sentido.`);
        }
      } else {
        relatorio.falhou.push(`Placar de ${a.numero}: números não encontrados ou incoerentes na página. Mantido o anterior.`);
      }
    } catch (e) {
      relatorio.falhou.push(`Placar de ${a.numero}: ${e.message}`);
    }
  }
  await salvarJSON(resolve(DADOS, "alertas.json"), alertasArq);

  // 2. Boletim
  console.log("2/4 Escrevendo o boletim");
  const noticias = pauta?.noticias || [];
  const proposicoes = pauta?.proposicoes || [];
  if (!noticias.length && !proposicoes.length) {
    relatorio.falhou.push("A coleta não trouxe notícias nem projetos. Nenhuma edição foi criada.");
  } else {
    const links = new Set([
      ...noticias.map((n) => n.url),
      ...alertasArq.alertas.flatMap((a) => [a.consulta?.url, a.acao?.url, ...(a.fontes || []).map((f) => f.url)]).filter(Boolean),
      ...agenda.eventos.map((e) => e.url).filter(Boolean),
    ]);
    const pedido = `Hoje é ${agoraBR.slice(0, 10)}. Monte a edição do boletim com 3 a 6 itens, nesta prioridade:
1) alertas ativos com novidade; 2) notícias ligadas aos temas que afetam direitos da população; 3) datas da agenda dos próximos 7 dias.
Descarte notícias repetidas (mesmo fato em veículos diferentes: fique com a fonte mais confiável) e boatos.

Responda neste formato:
{"manchete": "frase curta com o fato mais importante (até 120 caracteres)",
 "itens": [{"tipo": "alerta|noticia|agenda", "titulo": "com suas palavras, até 90 caracteres", "texto": "1 ou 2 frases, só com o que o título e o veículo sustentam", "url": "link exato da lista ou null", "fonte": "nome do veículo ou null"}],
 "sugestoes_alerta": [{"numero": "PL x/aaaa", "url": "link exato da lista de projetos", "motivo": "uma frase dizendo por que merece atenção"}],
 "duvidas": ["pontos que a equipe deve conferir"]}

ALERTAS ATIVOS:
${JSON.stringify(alertasArq.alertas.map((a) => ({ numero: a.numero, titulo: a.titulo, situacao: a.situacao, consulta: a.consulta ? { url: a.consulta.url, sim: a.consulta.sim, nao: a.consulta.nao } : null })), null, 1)}

AGENDA:
${JSON.stringify(agenda.eventos.filter((e) => !e.exemplo).map((e) => ({ data: e.data || e.rotulo_data, titulo: e.titulo, url: e.url })), null, 1)}

NOTÍCIAS COLETADAS (tema, título, veículo, link):
${noticias.map((n) => `- [${n.tema}] ${n.titulo} | ${n.fonte || "?"} | ${n.url}`).join("\n")}

PROJETOS APRESENTADOS NA CÂMARA NOS ÚLTIMOS DIAS:
${proposicoes.map((p) => `- ${p.numero} [${p.temas.join(", ")}]: ${p.ementa} | ${p.url}`).join("\n") || "(nenhum)"}`;

    try {
      const r = await perguntarGemini(SISTEMA, pedido, chave, "boletim");
      const { manchete, itens, descartados } = filtrarEdicao(r, links);
      if (!manchete || !itens.length) throw new Error("a resposta não trouxe manchete ou itens válidos");
      const { id, hora } = idEdicao(agoraBR);
      const edicao = { id, data: agoraBR.slice(0, 10), hora, exemplo: false, gerado_por_ia: true, manchete, itens };
      await salvarJSON(resolve(DADOS, "boletim.json"), aplicarEdicao(boletim, edicao));
      relatorio.mudou.push(`Boletim ${id}: "${manchete}" com ${itens.length} itens`);
      descartados.forEach((d) => relatorio.conferir.push(`Descartado automaticamente: ${d}`));
      (Array.isArray(r.duvidas) ? r.duvidas : []).forEach((d) => relatorio.conferir.push(limpar(d)));
      const linksProjetos = new Set(proposicoes.map((p) => p.url));
      (Array.isArray(r.sugestoes_alerta) ? r.sugestoes_alerta : [])
        .filter((s) => linksProjetos.has(s?.url))
        .forEach((s) => relatorio.sugestoes.push(`${limpar(s.numero)}: ${limpar(s.motivo)} (${s.url})`));
    } catch (e) {
      relatorio.falhou.push(`Boletim: ${e.message}`);
    }
  }

  // 3. Checagens das agências
  console.log("3/4 Checagens das agências");
  const brutas = (pauta?.checagens || [])
    .map((c) => ({ ...c, veredito: vereditoDoTitulo(c.titulo) }))
    .filter((c) => c.veredito && /^https:\/\//.test(c.url));
  const unicas = [...new Map(brutas.map((c) => [c.url, c])).values()].slice(0, 8);
  if (!unicas.length) {
    relatorio.falhou.push("Checagens: nenhuma checagem com veredito claro no título nos últimos dias.");
  } else {
    try {
      const r = await perguntarGemini(SISTEMA, `Abaixo estão títulos de checagens publicadas por agências profissionais de checagem.
Para cada uma, reescreva em linguagem simples, SEM mudar o veredito e SEM acrescentar fatos que não estejam no título.
Responda: {"checagens": [{"url": "link exato", "titulo": "até 90 caracteres dizendo o que é verdade", "circula": "a afirmação que circula, entre aspas, como as pessoas compartilham", "verdade": "1 ou 2 frases: o que a agência concluiu, atribuindo a ela (Segundo a agência ...)"}]}
Se o título não deixar claro o que circula, deixe a checagem de fora.

CHECAGENS:
${unicas.map((c) => `- [${c.veredito}] ${c.titulo} | ${c.agencia} | ${c.url}`).join("\n")}`, chave, "checagens");
      const porUrl = new Map(unicas.map((c) => [c.url, c]));
      const hojeBR = agoraBR.slice(0, 10);
      const novas = (Array.isArray(r?.checagens) ? r.checagens : [])
        .filter((x) => porUrl.has(x?.url))
        .map((x) => {
          const o = porUrl.get(x.url);
          return {
            id: slugChecagem(x.url, hojeBR),
            veredito: o.veredito,
            titulo: corta(x.titulo, 120),
            circula: corta(x.circula, 500),
            verdade: corta(x.verdade, 900),
            data: hojeBR,
            gerado_por_ia: true,
            fontes: [{ nome: `${o.agencia}${o.fonte && o.fonte !== o.agencia ? ` (${o.fonte})` : ""}`, url: x.url }],
          };
        })
        .filter((c) => c.titulo && c.circula && c.verdade);
      const arqChecagens = await lerJSON(resolve(DADOS, "checagens.json"), { checagens: [] });
      const { arquivo, entraram } = aplicarChecagens(arqChecagens, novas);
      if (entraram) {
        await salvarJSON(resolve(DADOS, "checagens.json"), arquivo);
        relatorio.mudou.push(`Checagens: ${entraram} novas, resumidas de agências profissionais`);
        relatorio.conferir.push("Checagens: abra o link de cada uma e confira se o resumo bate com a matéria da agência.");
      } else {
        relatorio.falhou.push("Checagens: nenhuma checagem nova (as encontradas já estavam no site).");
      }
    } catch (e) {
      relatorio.falhou.push(`Checagens: ${e.message}`);
    }
  }

  // 4. Relatório para quem revisa
  console.log("4/4 Relatório");
  const secao = (titulo, lista) => `## ${titulo}\n\n${lista.length ? lista.map((x) => `- ${x}`).join("\n") : "- Nada."}\n`;
  const md = [
    `# Rascunhos do robô (Gemini, modelo ${nomeModelo()})\n`,
    "Tudo aqui foi escrito por IA. Leia na aba **Files changed** antes de aprovar. Para corrigir, edite o arquivo direto no GitHub.\n",
    secao("O que mudou", relatorio.mudou),
    secao("Conferir com atenção", relatorio.conferir),
    secao("Sugestões de novos alertas", relatorio.sugestoes),
    secao("O que falhou", relatorio.falhou),
  ].join("\n");
  await writeFile(resolve(PAUTA, "relatorio.md"), md, "utf8");
  console.log(md);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
