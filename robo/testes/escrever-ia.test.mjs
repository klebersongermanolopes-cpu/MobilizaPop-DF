// Testes das travas de segurança do escritor com Gemini.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarEdicao, aplicarEdicao, placarCoerente, idEdicao, lerRespostaGemini } from "../escrever-ia.mjs";

const permitidos = new Set(["https://g1.globo.com/a", "https://www12.senado.leg.br/ecidadania/x"]);

test("Gemini: aceita só itens com link da pauta e descarta notícia sem link", () => {
  const r = filtrarEdicao({
    manchete: "Manchete do dia",
    itens: [
      { tipo: "noticia", titulo: "Notícia boa", texto: "Texto.", url: "https://g1.globo.com/a", fonte: "g1" },
      { tipo: "noticia", titulo: "Inventada", texto: "Texto.", url: "https://site-falso.com/x" },
      { tipo: "noticia", titulo: "Sem link", texto: "Texto.", url: null },
      { tipo: "agenda", titulo: "Posse", texto: "Dia 1º.", url: null },
      { tipo: "opiniao", titulo: "Tipo errado", texto: "Texto." },
    ],
  }, permitidos);
  assert.deepEqual(r.itens.map((i) => i.titulo), ["Notícia boa", "Posse"]);
  assert.equal(r.descartados.length, 3);
});

test("Gemini: corta textos longos e limita a 6 itens", () => {
  const itens = Array.from({ length: 9 }, (_, i) => ({ tipo: "agenda", titulo: "T".repeat(200), texto: "x", url: null }));
  const r = filtrarEdicao({ manchete: "M", itens }, permitidos);
  assert.equal(r.itens.length, 6);
  assert.ok(r.itens[0].titulo.length <= 110);
});

test("Gemini: nova edição entra no topo, apaga exemplos e substitui a mesma edição", () => {
  const antigo = { edicoes: [{ id: "ex", exemplo: true }, { id: "2026-10-27-tarde" }, { id: "2026-10-28-manha", manchete: "velha" }] };
  const r = aplicarEdicao(antigo, { id: "2026-10-28-manha", data: "2026-10-28", manchete: "nova" });
  assert.deepEqual(r.edicoes.map((e) => e.id), ["2026-10-28-manha", "2026-10-27-tarde"]);
  assert.equal(r.edicoes[0].manchete, "nova");
});

test("Gemini: placar só é aceito se os votos aumentarem", () => {
  const antigo = { sim: 10660, nao: 14388 };
  assert.equal(placarCoerente(antigo, { sim: 10700, nao: 14500 }), true);
  assert.equal(placarCoerente(antigo, { sim: 900, nao: 14500 }), false);
  assert.equal(placarCoerente(antigo, { sim: null, nao: null }), false);
});

test("Gemini: id da edição pelo horário de Brasília", () => {
  assert.deepEqual(idEdicao("2026-10-28T08:17:00-03:00"), { id: "2026-10-28-manha", hora: "8h" });
  assert.deepEqual(idEdicao("2026-10-28T17:17:00-03:00"), { id: "2026-10-28-tarde", hora: "17h" });
});

test("Gemini: lê a resposta mesmo com bloco de código em volta", () => {
  const j = { candidates: [{ content: { parts: [{ text: "```json\n{\"a\":1}\n```" }] } }] };
  assert.deepEqual(lerRespostaGemini(j), { a: 1 });
  assert.throws(() => lerRespostaGemini({ promptFeedback: { blockReason: "SAFETY" } }), /bloqueado/);
});

test("Placar: lê SIM e NÃO direto do texto da página do e-Cidadania", async () => {
  const { lerPlacarDaPagina } = await import("../escrever-ia.mjs");
  const r = lerPlacarDaPagina("Consulta pública Votos apurados até 28/10/2026, 17:54:42 SIM 10.660 NÃO 14.388 Opine");
  assert.deepEqual(r, { sim: 10660, nao: 14388, apurado_em: "2026-10-28T17:54" });
  const vazio = lerPlacarDaPagina("página sem placar");
  assert.equal(vazio.sim, null);
  assert.equal(placarCoerente({ sim: 1, nao: 1 }, vazio), false);
});

test("Checagens: veredito vem do título da agência, não da IA", async () => {
  const { vereditoDoTitulo } = await import("../escrever-ia.mjs");
  assert.equal(vereditoDoTitulo("É falso que governo vai taxar o Pix"), "falso");
  assert.equal(vereditoDoTitulo("É #FAKE que vídeo mostra fraude em urna"), "falso");
  assert.equal(vereditoDoTitulo("Post tira de contexto fala de ministro"), "enganoso");
  assert.equal(vereditoDoTitulo("É #FATO que salário mínimo subiu"), "verdadeiro");
  assert.equal(vereditoDoTitulo("Fato ou Fake: as checagens da semana"), null);
  assert.equal(vereditoDoTitulo("Câmara aprova projeto em primeiro turno"), null);
});

test("Checagens: entram sem repetir link e apagam os modelos", async () => {
  const { aplicarChecagens } = await import("../escrever-ia.mjs");
  const atual = { checagens: [{ id: "m", modelo: true, fontes: [] }, { id: "a", fontes: [{ url: "https://x.com/1" }] }] };
  const novas = [{ id: "b", data: "2026-10-29", fontes: [{ url: "https://x.com/1" }] }, { id: "c", data: "2026-10-29", fontes: [{ url: "https://x.com/2" }] }];
  const { arquivo, entraram } = aplicarChecagens(atual, novas);
  assert.equal(entraram, 1);
  assert.deepEqual(arquivo.checagens.map((c) => c.id), ["c", "a"]);
});
