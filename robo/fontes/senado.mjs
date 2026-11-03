// Senado Federal: Dados Abertos (https://legis.senado.leg.br/dadosabertos/docs/)
import { baixar, limpar } from "../lib.mjs";

const URL_ATUAIS = "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json";

const lista = (x) => (Array.isArray(x) ? x : x ? [x] : []);

export function lerSenadores(json) {
  const parl = lista(json?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar);
  const vistos = new Set();
  return parl
    .map((p) => p.IdentificacaoParlamentar || {})
    .filter((i) => i.CodigoParlamentar && !vistos.has(i.CodigoParlamentar) && vistos.add(i.CodigoParlamentar))
    .map((i) => ({
      id: String(i.CodigoParlamentar),
      nome: limpar(i.NomeParlamentar),
      partido: limpar(i.SiglaPartidoParlamentar),
      uf: limpar(i.UfParlamentar),
      email: i.EmailParlamentar ? limpar(i.EmailParlamentar) : null,
      foto: i.UrlFotoParlamentar ? String(i.UrlFotoParlamentar).replace(/^http:/, "https:") : null,
      url: i.UrlPaginaParlamentar ? String(i.UrlPaginaParlamentar).replace(/^http:/, "https:") : null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function senadores() {
  return lerSenadores(await baixar(URL_ATUAIS));
}
