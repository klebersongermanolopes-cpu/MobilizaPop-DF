/* Mobiliza Pop — app
   Lê os arquivos em data/*.json e monta as páginas. Navegação por #hash.
   Sem dependências além do GSAP (animações), que é opcional: sem ele, tudo funciona. */
(function () {
  "use strict";

  var reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var temGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  if (temGsap) gsap.registerPlugin(ScrollTrigger);
  var animar = temGsap && !reduz;

  var D = {};
  var ROTAS = ["inicio", "alertas", "monitor", "checagem", "boletim", "sobre"];
  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var estado = { casa: "camara", pl: "", edicao: "" };
  var anims = [];

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function icone(id) { return '<svg class="ico" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function linkFora(url, texto, classe) {
    if (!url || !/^https?:\/\//.test(url)) return "";
    return '<a class="' + (classe || "") + '" href="' + esc(url) + '" target="_blank" rel="noopener">' + texto + " " + icone("i-sai") + "</a>";
  }
  function num(n) { return Number(n || 0).toLocaleString("pt-BR"); }
  function partesData(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? { a: m[1], m: +m[2], d: m[3] } : null;
  }
  function dataBR(iso) { var p = partesData(iso); return p ? p.d + "/" + String(p.m).padStart(2, "0") + "/" + p.a : ""; }
  function dataCurta(iso) { var p = partesData(iso); return p ? p.d + "/" + String(p.m).padStart(2, "0") : ""; }
  function horaBR(iso) { var m = /T(\d{2}):(\d{2})/.exec(iso || ""); return m ? m[1] + "h" + m[2] : ""; }
  function semAcento(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

  var toastEl = $("toast"), toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("on"); }, 2400);
  }
  function copiar(texto, msg) {
    function reserva() {
      var t = document.createElement("textarea");
      t.value = texto; t.setAttribute("readonly", "");
      t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(t);
      toast(ok ? msg : "Não deu para copiar. Selecione o texto e copie manualmente.");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(function () { toast(msg); }, reserva);
    } else reserva();
  }

  function carregar(nome) {
    return fetch("data/" + nome + ".json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { return null; });
  }

  function alertas() { return (D.alertas && D.alertas.alertas) || []; }
  function alertaPorSlug(s) { return alertas().filter(function (a) { return a.slug === s; })[0]; }

  /* ---------- início ---------- */
  function renderTicker() {
    var itens = alertas().map(function (a) { return a.numero + " / " + (a.situacao || "em alerta"); });
    itens.push("Cobre seu parlamentar", "Confira antes de compartilhar");
    var bloco = itens.map(function (t) { return "<span>" + esc(t) + "</span><i></i>"; }).join("");
    $("ticker").innerHTML = bloco + bloco;
  }

  function renderAgenda() {
    var ev = (D.agenda && D.agenda.eventos) || [];
    if (!ev.length) { $("agenda").innerHTML = '<div class="vazio">Nenhuma data cadastrada.</div>'; return; }
    $("agenda").innerHTML = ev.map(function (e) {
      var p = partesData(e.data);
      var data = p
        ? '<div class="data">' + p.d + "<small>" + MESES[p.m - 1] + " " + p.a + "</small></div>"
        : '<div class="data texto">' + esc(e.rotulo_data || "A definir") + "</div>";
      var titulo = e.url && /^https?:\/\//.test(e.url)
        ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.titulo) + "</a>"
        : esc(e.titulo);
      var tagCls = e.exemplo ? "sol" : (e.tag === "Votar" ? "verm" : "");
      return '<div class="ev">' + data + "<div><h3>" + titulo + "</h3><p>" + esc(e.descricao) + "</p></div>" +
        '<span class="tag ' + tagCls + '">' + esc(e.exemplo ? "Exemplo" : e.tag) + "</span></div>";
    }).join("");
  }

  function prepararManifesto() {
    var p = $("manifesto-txt");
    if (p.dataset.pronto) return;
    p.dataset.pronto = "1";
    (function quebrar(no) {
      Array.prototype.slice.call(no.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (parte) {
            if (!parte) return;
            if (/^\s+$/.test(parte)) frag.appendChild(document.createTextNode(parte));
            else { var s = document.createElement("span"); s.className = "w"; s.textContent = parte; frag.appendChild(s); }
          });
          no.replaceChild(frag, n);
        } else if (n.nodeType === 1) quebrar(n);
      });
    })(p);
  }

  function animInicio() {
    if (!animar) return;
    anims.push(gsap.from(".hero h1 .ln > span", { yPercent: 105, duration: .8, ease: "power4.out", stagger: .09 }));
    anims.push(gsap.from(".selo-grande", { scale: .6, rotation: -20, duration: .9, ease: "back.out(1.8)" }));
    anims.push(gsap.to(".selo-anel", { rotation: 360, ease: "none",
      scrollTrigger: { trigger: "#v-inicio", start: "top top", end: "bottom bottom", scrub: .6 } }));
    anims.push(gsap.to(".selo-grande", { rotation: -10, scale: .92, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } }));
    anims.push(gsap.fromTo("#manifesto-txt .w", { opacity: .18 }, { opacity: 1, stagger: .05, ease: "none",
      scrollTrigger: { trigger: ".manifesto", start: "top 75%", end: "bottom 60%", scrub: true } }));
    anims.push(gsap.from(".frente", { y: 70, rotation: function (i) { return i % 2 ? 3 : -3; }, duration: .7, ease: "back.out(1.6)", stagger: .1,
      scrollTrigger: { trigger: ".frentes", start: "top 85%" } }));
    anims.push(gsap.from(".ev", { x: -40, duration: .5, stagger: .1, ease: "power3.out",
      scrollTrigger: { trigger: ".agenda", start: "top 85%" } }));
    var mm = gsap.matchMedia();
    mm.add("(min-width: 821px)", function () {
      var trilho = document.querySelector(".passos-trilho");
      var dist = function () { return Math.max(0, trilho.scrollWidth - window.innerWidth); };
      gsap.to(trilho, { x: function () { return -dist(); }, ease: "none",
        scrollTrigger: { trigger: ".passos", start: "top top", end: function () { return "+=" + dist(); }, pin: true, scrub: .5, invalidateOnRefresh: true } });
    });
    anims.push(mm);
  }

  /* ---------- alertas ---------- */
  function renderListaAlertas() {
    var lista = alertas();
    if (!lista.length) { $("lista-alertas").innerHTML = '<div class="vazio">Nenhum alerta no momento.</div>'; return; }
    $("lista-alertas").innerHTML = lista.map(function (a) {
      var pr = a.prioridade === "media" ? "media" : (a.prioridade === "baixa" ? "baixa" : "");
      var tags = (a.temas || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("");
      return '<a class="card-alerta" href="#' + esc(a.slug) + '">' +
        '<div class="topo-card ' + pr + '"><p class="mono">' + esc(a.casa) + "</p><div class=\"num\">" + esc(a.numero) + "</div></div>" +
        '<div class="corpo"><h2>' + esc(a.titulo) + "</h2><p>" + esc(a.resumo) + "</p>" +
        '<p class="mono" style="font-size:12px">' + esc(a.situacao) + " / atualizado em " + esc(dataBR(a.atualizado_em)) + "</p>" +
        '<div class="tags">' + tags + "</div></div></a>";
    }).join("");
  }

  function renderAlerta(a) {
    var partes = String(a.numero).split("/");
    var numeroHtml = partes.length === 2 ? esc(partes[0]) + "<br>/" + esc(partes[1]) : esc(a.numero);
    var caps = a.capitulos || [];
    var total = String(caps.length).padStart(2, "0");
    var c = a.consulta;
    var placar = "";
    if (c && (c.sim || c.nao)) {
      var tot = (c.sim || 0) + (c.nao || 0);
      var pn = tot ? Math.round(c.nao / tot * 1000) / 10 : 0;
      var ps = tot ? Math.round(c.sim / tot * 1000) / 10 : 0;
      placar = '<div class="placar" aria-label="Placar da consulta pública">' +
        '<div class="barra nao"><b>Não</b><div class="trilho"><div class="enche" style="width:' + pn + '%"></div></div><span class="v">' + num(c.nao) + "</span></div>" +
        '<div class="barra sim"><b>Sim</b><div class="trilho"><div class="enche" style="width:' + ps + '%"></div></div><span class="v">' + num(c.sim) + "</span></div></div>" +
        '<p class="fonte-pq">Placar até ' + esc(dataBR(c.apurado_em)) + (horaBR(c.apurado_em) ? ", " + horaBR(c.apurado_em) : "") + ". Fonte: " + esc(c.fonte || "consulta pública") + ".</p>";
    }
    var htmlCaps = caps.map(function (cap, i) {
      var n = String(i + 1).padStart(2, "0");
      var corpo = (cap.texto || []).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("");
      if (cap.nota) corpo += '<p class="nota">' + esc(cap.nota) + "</p>";
      if (cap.tipo === "acao") {
        corpo += '<div class="acoes">' +
          (a.acao ? linkFora(a.acao.url, esc(a.acao.texto), "btn verm") : "") +
          (a.mensagem_whatsapp ? '<button class="btn broto" type="button" data-copiar-zap="' + esc(a.slug) + '">Copiar para o WhatsApp</button>' : "") +
          '<a class="btn claro" href="#monitor" data-cobrar="' + esc(a.slug) + '">Cobrar</a></div>';
      }
      return '<section class="cap" data-n="' + n + '" data-t="' + esc(cap.rotulo) + '"' + (cap.tipo === "placar" ? ' data-placar="1"' : "") + ">" +
        '<p class="mono">' + n + " / " + esc(cap.rotulo) + "</p><h2>" + esc(cap.titulo) + "</h2>" + corpo + "</section>";
    }).join("");
    var fontes = (a.fontes || []).map(function (f) { return linkFora(f.url, esc(f.nome)); }).filter(Boolean).join("");
    $("v-alerta").innerHTML =
      '<div class="alerta-topo"><div class="wrap">' +
        '<a class="voltar mono" href="#alertas">Todos os alertas</a>' +
        '<p class="mono" style="margin-bottom:14px">Alerta / ' + esc(a.casa) + "</p>" +
        "<h1>" + numeroHtml + "</h1>" +
        '<p class="sub">' + esc(a.titulo) + "</p>" +
        '<div class="meta">' +
          (a.autoria ? '<span class="tag">Autoria: ' + esc(a.autoria) + "</span>" : "") +
          (a.situacao ? '<span class="tag">' + esc(a.situacao) + "</span>" : "") +
          '<span class="tag">Atualizado em ' + esc(dataBR(a.atualizado_em)) + "</span>" +
          (a.gerado_por_ia ? '<span class="tag sol">Rascunho feito com IA, revisado pela equipe</span>' : "") +
        "</div></div></div>" +
      '<div class="wrap"><div class="scrolly">' +
        '<aside class="palco" aria-label="Resumo do alerta">' +
          '<div class="contador"><span id="cap-n">01</span><small>/' + total + "</small></div>" +
          '<div class="titulo-cap" id="cap-t">' + esc(caps[0] ? caps[0].rotulo : "") + "</div>" +
          '<p class="resumo">' + esc(a.resumo) + "</p>" + placar +
        "</aside>" +
        '<div class="caps">' + htmlCaps + (fontes ? '<div class="fontes"><p class="mono">Fontes</p>' + fontes + "</div>" : "") + "</div>" +
      "</div></div>";
  }

  function animAlerta() {
    var caps = document.querySelectorAll("#v-alerta .cap");
    var nEl = $("cap-n"), tEl = $("cap-t");
    function ativa(c) {
      caps.forEach(function (x) { x.classList.toggle("ativo", x === c); });
      nEl.textContent = c.dataset.n; tEl.textContent = c.dataset.t;
    }
    if (!temGsap) return;
    caps.forEach(function (c) {
      ScrollTrigger.create({ trigger: c, start: "top 55%", end: "bottom 55%", onToggle: function (s) { if (s.isActive) ativa(c); } });
    });
    if (!animar) return;
    anims.push(gsap.from(".alerta-topo h1", { y: 40, skewY: 4, duration: .7, ease: "power4.out" }));
    var capPlacar = document.querySelector('#v-alerta .cap[data-placar="1"]');
    if (capPlacar) anims.push(gsap.from(".barra .enche", { width: 0, duration: 1.1, ease: "power3.out", stagger: .15,
      scrollTrigger: { trigger: capPlacar, start: "top 60%" } }));
    anims.push(gsap.fromTo(".palco", { rotation: -1.5 }, { rotation: 1.5, ease: "none",
      scrollTrigger: { trigger: ".scrolly", start: "top center", end: "bottom center", scrub: true } }));
  }

  /* ---------- monitor ---------- */
  function listaCasa() {
    var fonte = estado.casa === "senado" ? D.senadores : D.deputados;
    return (fonte && fonte.parlamentares) || [];
  }
  function iniciais(n) {
    var p = String(n).replace(/^(Prof\.|Profa\.|Dr\.|Dra\.|Pastor|Pastora|Delegado|Delegada|Coronel|Capitão|General|Sargento)\s+/i, "").split(/\s+/);
    return ((p[0] || "")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  }
  function preencherFiltros() {
    var ufs = {}, ps = {};
    listaCasa().forEach(function (d) { ufs[d.uf] = 1; ps[d.partido] = 1; });
    var ufSel = $("uf"), pSel = $("partido");
    var ufAtual = ufSel.value, pAtual = pSel.value;
    ufSel.length = 1; pSel.length = 1;
    Object.keys(ufs).sort().forEach(function (u) { ufSel.add(new Option(u, u)); });
    Object.keys(ps).sort().forEach(function (p) { pSel.add(new Option(p, p)); });
    if (ufs[ufAtual]) ufSel.value = ufAtual;
    if (ps[pAtual]) pSel.value = pAtual;
    var plSel = $("pl-cobranca");
    if (!plSel.options.length) {
      alertas().forEach(function (a) { plSel.add(new Option(a.numero + " / " + a.titulo, a.slug)); });
      if (!plSel.options.length) plSel.add(new Option("Nenhum alerta ativo", ""));
    }
    if (estado.pl) plSel.value = estado.pl;
  }
  function statusMonitor() {
    var fonte = estado.casa === "senado" ? D.senadores : D.deputados;
    var el = $("status-monitor");
    if (!fonte) {
      el.hidden = false; el.className = "aviso-faixa";
      el.innerHTML = "<b>Sem dados</b><span>Não foi possível carregar a lista. Tente recarregar a página.</span>";
    } else if (fonte.amostra) {
      el.hidden = false; el.className = "aviso-faixa";
      el.innerHTML = "<b>Prévia</b><span>" + esc(fonte.observacao || "Lista parcial.") + " Dados de " + esc(dataBR(fonte.atualizado_em)) + ".</span>";
    } else {
      el.hidden = false; el.className = "aviso-faixa ok";
      el.innerHTML = "<b>Atualizado</b><span>" + num(fonte.parlamentares.length) + " parlamentares em exercício. " + esc(fonte.fonte) + ", " + esc(dataBR(fonte.atualizado_em)) + ".</span>";
    }
  }
  function votosDe(id) {
    if (estado.casa !== "camara" || !D.votos || !D.votos.votos) return [];
    return D.votos.votos[String(id)] || [];
  }
  function renderMonitor() {
    var q = semAcento($("busca").value.trim());
    var uf = $("uf").value, pt = $("partido").value;
    var lista = listaCasa().filter(function (d) {
      return (!q || semAcento(d.nome).indexOf(q) > -1) && (!uf || d.uf === uf) && (!pt || d.partido === pt);
    });
    $("contagem").innerHTML = num(lista.length) + "<small>" + (lista.length === 1 ? "parlamentar" : "parlamentares") + "</small>";
    var g = $("grade");
    g._lista = lista;
    if (!lista.length) { g.innerHTML = '<div class="vazio">Ninguém com esse filtro. Tente outro nome ou limpe o estado e o partido.</div>'; return; }
    var cores = ["var(--sol)", "var(--broto)", "var(--papel-2)", "var(--musgo)"];
    g.innerHTML = lista.map(function (d, i) {
      var foto = d.foto && /^https:\/\//.test(d.foto)
        ? '<img src="' + esc(d.foto) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : "";
      var votos = votosDe(d.id).map(function (v) {
        var cls = /^sim/i.test(v.voto) ? "voto-sim" : (/^n[aã]o/i.test(v.voto) ? "voto-nao" : "");
        return '<span class="tag ' + cls + '">' + esc(v.numero) + ": " + esc(v.voto) + "</span>";
      }).join("");
      return '<article class="parl">' +
        '<div class="cara"><div class="foto" style="background:' + cores[i % cores.length] + '">' + esc(iniciais(d.nome)) + foto + "</div>" +
        '<div class="quem"><h3>' + esc(d.nome) + '</h3><span class="tag">' + esc(d.partido) + " / " + esc(d.uf) + "</span></div></div>" +
        '<div class="corpo">' +
          '<span class="mono" style="font-size:11px">E-mail oficial</span><span class="email">' + esc(d.email || "não informado") + "</span>" +
          (votos ? '<span class="mono" style="font-size:11px">Votos em projetos em alerta</span><div class="votos">' + votos + "</div>" : "") +
          '<div class="acoes">' +
            (d.email ? '<button class="mini" type="button" data-email="' + i + '">Copiar e-mail</button>' : "") +
            '<button class="mini forte" type="button" data-cobra="' + i + '">Copiar cobrança</button>' +
            (d.url ? '<a class="mini" href="' + esc(d.url) + '" target="_blank" rel="noopener">Perfil ' + icone("i-sai") + "</a>" : "") +
          "</div></div></article>";
    }).join("");
    if (animar) gsap.from(Array.prototype.slice.call(g.children, 0, 24), { y: 50, duration: .5, ease: "back.out(1.4)", stagger: .04, clearProps: "transform" });
  }
  function mensagemCobranca(d) {
    var trat = estado.casa === "senado" ? "Senador(a)" : "Deputado(a)";
    var a = alertaPorSlug($("pl-cobranca").value);
    var pedido = a && a.mensagem_cobranca
      ? a.mensagem_cobranca
      : "Sou eleitor(a) e acompanho o seu mandato. Quero saber como o(a) senhor(a) tem votado nos projetos que afetam direitos da população.";
    return "Olá, " + trat + " " + d.nome + ".\n\n" + pedido + "\n\nAguardo retorno.\n\nEnviado via Mobiliza Pop";
  }
  function iniciarMonitor() {
    preencherFiltros();
    statusMonitor();
    renderMonitor();
  }

  /* ---------- checagem ---------- */
  function renderChecagens() {
    var lista = (D.checagens && D.checagens.checagens) || [];
    if (!lista.length) { $("checks").innerHTML = '<div class="vazio">Nenhuma checagem publicada ainda.</div>'; return; }
    var rotulo = { falso: "Falso", enganoso: "Enganoso", verdadeiro: "Verdadeiro" };
    $("checks").innerHTML = lista.map(function (c) {
      var v = rotulo[c.veredito] ? c.veredito : "enganoso";
      var fontes = (c.fontes || []).map(function (f) { return linkFora(f.url, esc(f.nome)); }).filter(Boolean).join("<br>");
      return '<article class="check">' + (c.modelo ? '<span class="tag sol">Modelo</span>' : "") +
        '<span class="veredito ' + v + '">' + rotulo[v] + "</span><h2>" + esc(c.titulo) + "</h2>" +
        "<dl><dt>O que circula</dt><dd>" + esc(c.circula) + "</dd><dt>O que é verdade</dt><dd>" + esc(c.verdade) + "</dd>" +
        "<dt>Fonte</dt><dd>" + (fontes || (c.modelo ? "Link para o documento oficial, a lei ou o dado público." : "Sem fonte informada.")) + "</dd></dl>" +
        (c.data ? '<p class="fonte-pq">Publicada em ' + esc(dataBR(c.data)) + (c.gerado_por_ia ? ". Rascunho feito com IA, revisado pela equipe." : ".") + "</p>" : "") +
        "</article>";
    }).join("");
  }

  /* ---------- boletim ---------- */
  function edicoes() {
    return ((D.boletim && D.boletim.edicoes) || []).slice().sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
  }
  function textoWhatsapp(e) {
    var linhas = ["*Boletim Mobiliza Pop | " + dataCurta(e.data) + (e.hora ? ", " + e.hora : "") + "*", "", e.manchete || ""];
    (e.itens || []).forEach(function (it) {
      linhas.push("", "• *" + it.titulo + "*", it.texto);
      if (it.url) linhas.push(it.url);
    });
    return linhas.join("\n").trim();
  }
  function renderBoletim() {
    var lista = edicoes();
    if (!lista.length) { $("boletim").innerHTML = '<div class="vazio">Nenhuma edição publicada ainda.</div>'; return; }
    var e = lista.filter(function (x) { return x.id === estado.edicao; })[0] || lista[0];
    estado.edicao = e.id;
    var tipos = { alerta: ["Alerta", "verm"], noticia: ["Notícia", ""], agenda: ["Agenda", "broto"], checagem: ["Checagem", "sol"] };
    var itens = (e.itens || []).map(function (it) {
      var t = tipos[it.tipo] || ["Destaque", ""];
      return '<div class="item-bol"><div><span class="tag ' + t[1] + '">' + t[0] + "</span></div><div><h3>" + esc(it.titulo) + "</h3><p>" + esc(it.texto) + "</p>" +
        (it.url ? '<p style="margin-top:6px">' + linkFora(it.url, esc(it.fonte || "Ver fonte")) + "</p>" : "") + "</div></div>";
    }).join("");
    var outras = lista.slice(0, 10).map(function (x) {
      return '<li><button type="button" data-edicao="' + esc(x.id) + '"' + (x.id === e.id ? ' aria-current="true"' : "") + ">" +
        esc(dataBR(x.data)) + (x.hora ? ", " + esc(x.hora) : "") + "</button></li>";
    }).join("");
    $("boletim").innerHTML =
      '<article class="edicao"><div class="edicao-cab"><div><p class="mono" style="color:var(--broto)">Edição de ' + esc(dataBR(e.data)) + (e.hora ? ", " + esc(e.hora) : "") + "</p>" +
        "<h2>" + esc(e.manchete) + "</h2></div>" +
        "<div>" + (e.exemplo ? '<span class="tag sol">Edição de exemplo</span> ' : "") + (e.gerado_por_ia ? '<span class="tag broto">Rascunho feito com IA, revisado pela equipe</span>' : "") + "</div></div>" +
        itens + "</article>" +
      '<div class="lateral">' +
        '<div class="caixa"><h2>Para o WhatsApp</h2><pre id="texto-zap">' + esc(textoWhatsapp(e)) + "</pre>" +
        '<button class="btn broto" type="button" id="copiar-boletim">Copiar texto</button></div>' +
        '<div class="caixa"><h2>Edições</h2><ul class="lista-edicoes">' + outras + "</ul></div>" +
      "</div>";
  }

  /* ---------- rodapé ---------- */
  function renderRodape() {
    var c = D.config || {};
    $("cta-canal").innerHTML = c.canal_whatsapp && /^https:\/\//.test(c.canal_whatsapp)
      ? linkFora(c.canal_whatsapp, "Seguir o canal no WhatsApp", "btn broto")
      : '<span class="btn broto" aria-disabled="true">Canal no WhatsApp em breve</span>';
    var links = [];
    if (c.instagram) links.push(linkFora(c.instagram, "Instagram @mobilizapop"));
    links.push(linkFora("https://dadosabertos.camara.leg.br/", "Dados abertos da Câmara"));
    links.push(linkFora("https://www12.senado.leg.br/dados-abertos", "Dados abertos do Senado"));
    if (c.email_contato) links.push('<span class="mono" style="font-size:14px;user-select:all">' + esc(c.email_contato) + "</span>");
    $("links-rodape").innerHTML = links.join("");
    if (c.manifesto_aprovado === false) {
      var rot = document.querySelector(".manifesto .mono");
      if (rot) rot.textContent = "Manifesto / rascunho em aprovação";
    }
  }

  /* ---------- rotas ---------- */
  function limparAnim() {
    if (!temGsap) return;
    ScrollTrigger.getAll().forEach(function (st) { st.kill(); });
    anims.forEach(function (a) { if (a && a.revert) a.revert(); else if (a && a.kill) a.kill(); });
    anims = [];
    gsap.set(".passos-trilho, .selo-grande, .selo-anel, .hero h1 .ln > span, #manifesto-txt .w, .frente, .ev, .palco", { clearProps: "all" });
  }
  // Rotas da rede social (rede.js): #rede, #mapa, #reels, #evento/12, #post/12, #perfil/apelido, #regras...
  var ROTAS_REDE = ["rede", "mapa", "reels", "evento", "post", "perfil", "regras", "termos", "privacidade", "ferramentas"];
  function mostrar() {
    var completo = location.hash.replace(/^#/, "");
    var r = completo.split("/")[0];
    var alerta = null;
    var rede = ROTAS_REDE.indexOf(r) !== -1;
    if (!rede && ROTAS.indexOf(r) === -1) {
      alerta = alertaPorSlug(completo);
      if (!alerta) r = "inicio";
    }
    var view = alerta ? "alerta" : r;
    document.querySelectorAll("main > .view").forEach(function (v) { v.hidden = v.id !== "v-" + view; });
    document.querySelectorAll(".menu a").forEach(function (a) {
      var ativo = a.dataset.r === r || (alerta && a.dataset.r === "alertas") || (a.dataset.r === "rede" && ["post", "perfil", "reels"].indexOf(r) !== -1) || (a.dataset.r === "mapa" && r === "evento");
      if (ativo) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.body.classList.toggle("modo-mapa", view === "mapa");
    document.title = alerta ? alerta.numero + " | Mobiliza Pop" : "Mobiliza Pop";
    window.scrollTo(0, 0);
    limparAnim();
    if (rede) {
      if (window.MPRede) window.MPRede.mostrar(r, completo.split("/").slice(1).join("/"));
      return;
    }
    if (view === "inicio") animInicio();
    if (view === "alerta") { renderAlerta(alerta); animAlerta(); }
    if (view === "monitor") iniciarMonitor();
    if (temGsap) requestAnimationFrame(function () { ScrollTrigger.refresh(); });
  }

  /* ---------- eventos ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-copiar-zap],[data-cobrar],[data-email],[data-cobra],[data-edicao],#copiar-boletim,[data-casa]");
    if (!el) return;
    if (el.dataset.copiarZap) {
      var a = alertaPorSlug(el.dataset.copiarZap);
      if (a) copiar(a.mensagem_whatsapp, "Texto copiado. Agora é só colar no WhatsApp.");
    } else if (el.dataset.cobrar) {
      estado.pl = el.dataset.cobrar;
    } else if (el.dataset.email) {
      var d1 = $("grade")._lista[+el.dataset.email];
      copiar(d1.email, "E-mail copiado");
    } else if (el.dataset.cobra) {
      var d2 = $("grade")._lista[+el.dataset.cobra];
      copiar(mensagemCobranca(d2), "Mensagem copiada. Cole no e-mail do parlamentar.");
    } else if (el.dataset.edicao) {
      estado.edicao = el.dataset.edicao; renderBoletim();
    } else if (el.id === "copiar-boletim") {
      copiar($("texto-zap").textContent, "Boletim copiado. Agora é só colar no WhatsApp.");
    } else if (el.dataset.casa) {
      estado.casa = el.dataset.casa;
      document.querySelectorAll(".abas button").forEach(function (b) { b.setAttribute("aria-selected", String(b === el)); });
      $("uf").value = ""; $("partido").value = "";
      iniciarMonitor();
    }
  });
  $("busca").addEventListener("input", renderMonitor);
  $("uf").addEventListener("change", renderMonitor);
  $("partido").addEventListener("change", renderMonitor);
  $("pl-cobranca").addEventListener("change", function () { estado.pl = this.value; });
  window.addEventListener("hashchange", mostrar);

  /* ---------- início da página ---------- */
  document.documentElement.lang = "pt-BR";
  prepararManifesto();
  Promise.all(["config", "alertas", "agenda", "checagens", "boletim", "deputados", "senadores", "votos"].map(carregar))
    .then(function (r) {
      D = { config: r[0], alertas: r[1], agenda: r[2], checagens: r[3], boletim: r[4], deputados: r[5], senadores: r[6], votos: r[7] };
      renderTicker();
      renderAgenda();
      renderListaAlertas();
      renderChecagens();
      renderBoletim();
      renderRodape();
      mostrar();
    });
})();
