<?php
// Rotas da rede social: perfil, feed, posts, stories, reels, comentários, apoios, eventos, mapa e denúncias.
declare(strict_types=1);
if (!defined('MP_API')) { http_response_code(404); exit; }

const TIPOS_POST = ['texto', 'foto', 'video', 'story', 'reel'];
const MOTIVOS_DENUNCIA = [
    'desinformacao' => 'Notícia falsa ou enganosa',
    'odio'          => 'Discurso de ódio ou discriminação',
    'violencia'     => 'Ameaça ou incitação à violência',
    'antidemocratico' => 'Ataque à democracia',
    'assedio'       => 'Assédio ou perseguição',
    'dados'         => 'Expõe dados pessoais de alguém',
    'menores'       => 'Envolve crianças ou adolescentes de forma imprópria',
    'golpe'         => 'Golpe, spam ou propaganda',
    'falso'         => 'Perfil falso ou se passando por outra pessoa',
    'outro'         => 'Outro motivo',
];

/* ---------------- montar respostas ---------------- */
function montar_posts(array $linhas, ?array $eu): array {
    if (!$linhas) return [];
    $ids = array_map(fn($p) => (int) $p['id'], $linhas);
    $marc = implode(',', array_fill(0, count($ids), '?'));
    $midias = [];
    foreach (todos("SELECT post_id, tipo, arquivo, mime, largura, altura FROM midias WHERE post_id IN ($marc) ORDER BY ordem", $ids) as $m) {
        $midias[$m['post_id']][] = ['tipo' => $m['tipo'], 'url' => url_midia($m['arquivo']), 'mime' => $m['mime'],
                                    'largura' => $m['largura'] ? (int) $m['largura'] : null, 'altura' => $m['altura'] ? (int) $m['altura'] : null];
    }
    $apoiados = [];
    if ($eu) foreach (todos("SELECT post_id FROM apoios WHERE usuario_id = ? AND post_id IN ($marc)", array_merge([$eu['id']], $ids)) as $a) $apoiados[$a['post_id']] = true;
    return array_map(function ($p) use ($midias, $apoiados, $eu) {
        return [
            'id' => (int) $p['id'], 'tipo' => $p['tipo'], 'oficial' => (bool) $p['oficial'], 'titulo' => $p['titulo'], 'texto' => $p['texto'],
            'fonte_url' => $p['fonte_url'], 'evento_id' => $p['evento_id'] ? (int) $p['evento_id'] : null, 'evento_titulo' => $p['evento_titulo'] ?? null,
            'lat' => $p['lat'] !== null ? (float) $p['lat'] : null, 'lng' => $p['lng'] !== null ? (float) $p['lng'] : null,
            'uf' => $p['uf'], 'cidade' => $p['cidade'], 'bairro' => $p['bairro'],
            'status' => $p['status'], 'motivo' => ($eu && ((int) $eu['id'] === (int) $p['usuario_id'] || eh_mod($eu))) ? $p['motivo'] : null,
            'apoios' => (int) $p['apoios'], 'comentarios' => (int) $p['comentarios'], 'apoiei' => isset($apoiados[$p['id']]),
            'criado_em' => $p['criado_em'], 'expira_em' => $p['expira_em'], 'midias' => $midias[$p['id']] ?? [],
            'autor' => ['id' => (int) $p['usuario_id'], 'apelido' => $p['apelido'], 'nome' => $p['nome'], 'foto' => $p['foto_url'], 'papel' => $p['papel']],
            'meu' => $eu && (int) $eu['id'] === (int) $p['usuario_id'],
        ];
    }, $linhas);
}
const SQL_POST = 'SELECT p.*, u.apelido, u.nome, u.foto_url, u.papel, e.titulo AS evento_titulo
                  FROM posts p JOIN usuarios u ON u.id = p.usuario_id LEFT JOIN eventos e ON e.id = p.evento_id';

function montar_evento(array $e, ?array $eu): array {
    $vou = $eu ? (bool) um('SELECT 1 AS x FROM presencas WHERE evento_id = ? AND usuario_id = ?', [$e['id'], $eu['id']]) : false;
    return [
        'id' => (int) $e['id'], 'titulo' => $e['titulo'], 'descricao' => $e['descricao'], 'inicio' => $e['inicio'], 'fim' => $e['fim'],
        'local_nome' => $e['local_nome'], 'lat' => (float) $e['lat'], 'lng' => (float) $e['lng'], 'uf' => $e['uf'], 'cidade' => $e['cidade'],
        'bairro' => $e['bairro'], 'link' => $e['link'], 'status' => $e['status'], 'presencas' => (int) $e['presencas'], 'vou' => $vou,
        'autor' => isset($e['apelido']) ? ['id' => (int) $e['usuario_id'], 'apelido' => $e['apelido'], 'nome' => $e['nome'], 'foto' => $e['foto_url']] : null,
        'meu' => $eu && (int) $eu['id'] === (int) $e['usuario_id'],
        'motivo' => ($eu && ((int) $eu['id'] === (int) $e['usuario_id'] || eh_mod($eu))) ? $e['motivo'] : null,
    ];
}

/* ---------------- conta ---------------- */
function r_eu(): void {
    $u = usuario();
    responder([
        'usuario' => $u ? publico_usuario($u) + ['email' => $u['email'], 'aceitou_regras' => (bool) $u['aceitou_regras_em'],
                          'idade_verificada' => (bool) $u['idade_verificada'], 'nascimento' => $u['nascimento'], 'status' => $u['status']] : null,
        'csrf' => $_SESSION['csrf'],
        'google_client_id' => cfg('google_client_id'),
        'exigir_verificacao_idade' => (bool) cfg('exigir_verificacao_idade'),
        'limite_video_mb' => (int) cfg('limite_video_mb'),
        'motivos_denuncia' => MOTIVOS_DENUNCIA,
        'login_teste' => (bool) cfg('permitir_login_teste'),
    ]);
}

function r_entrar(): void {
    limitar('login:' . ip(), 20, 3600);
    $d = entrada();
    $token = txt($d, 'credential', 4096, true);
    $u = entrar_com_google($token);
    responder(['ok' => true, 'csrf' => $_SESSION['csrf'], 'usuario' => publico_usuario($u), 'novo' => !$u['aceitou_regras_em']]);
}

function r_sair(): void {
    $u = usuario();
    if ($u) registrar_acesso((int) $u['id'], 'logout');
    $_SESSION = [];
    if (!defined('MP_TESTE')) { session_destroy(); setcookie('MPSESS', '', ['expires' => time() - 3600, 'path' => '/']); }
    responder(['ok' => true]);
}

function r_perfil_salvar(): void {
    $u = exigir_login();
    $d = entrada();
    $campos = [];
    if (isset($d['apelido'])) {
        $ap = mb_strtolower((string) txt($d, 'apelido', 30, true));
        if (!preg_match('/^[a-z0-9_]{3,30}$/', $ap)) erro(422, 'O apelido pode ter de 3 a 30 letras sem acento, números e _.');
        if (in_array($ap, ['admin', 'mobilizapop', 'mobiliza', 'moderacao', 'equipe', 'oficial', 'suporte'], true) && !eh_admin($u)) erro(422, 'Este apelido é reservado.');
        $outro = um('SELECT id FROM usuarios WHERE apelido = ? AND id <> ?', [$ap, $u['id']]);
        if ($outro) erro(409, 'Esse apelido já está em uso.');
        $campos['apelido'] = $ap;
    }
    if (array_key_exists('nome', $d)) $campos['nome'] = txt($d, 'nome', 80, true);
    if (array_key_exists('bio', $d)) {
        $bio = txt($d, 'bio', 300);
        $a = analisar_texto($bio, $u);
        if ($a['acao'] !== 'ok') erro(422, 'Sua bio não passou no filtro: ' . $a['motivo'] . '.');
        $campos['bio'] = $bio;
    }
    if (array_key_exists('uf', $d)) $campos['uf'] = uf_valida(txt($d, 'uf', 2));
    if (array_key_exists('cidade', $d)) $campos['cidade'] = txt($d, 'cidade', 80);
    if (!empty($d['aceito_regras'])) {
        $nasc = txt($d, 'nascimento', 10, true);
        $dt = DateTime::createFromFormat('!Y-m-d', $nasc);
        if (!$dt || $dt->format('Y-m-d') !== $nasc || $dt > new DateTime('-10 years') || $dt < new DateTime('-120 years')) erro(422, 'Data de nascimento inválida.');
        $idade = $dt->diff(new DateTime())->y;
        if ($idade < (int) cfg('idade_minima')) erro(403, 'A rede Mobiliza Pop é só para maiores de ' . cfg('idade_minima') . ' anos. O portal de notícias continua aberto para você.');
        $campos['nascimento'] = $nasc;
        $campos['aceitou_regras_em'] = agora();
    }
    if (!$campos) erro(422, 'Nada para salvar.');
    $sets = implode(', ', array_map(fn($c) => "$c = ?", array_keys($campos)));
    q("UPDATE usuarios SET $sets WHERE id = ?", array_merge(array_values($campos), [$u['id']]));
    $n = um('SELECT * FROM usuarios WHERE id = ?', [$u['id']]);
    responder(['ok' => true, 'usuario' => publico_usuario($n) + ['aceitou_regras' => (bool) $n['aceitou_regras_em'], 'idade_verificada' => (bool) $n['idade_verificada']]]);
}

// LGPD art. 18: acesso e portabilidade dos dados
function r_meus_dados(): void {
    $u = exigir_login();
    responder([
        'conta' => array_diff_key($u, ['google_sub' => 1]),
        'posts' => todos('SELECT id, tipo, texto, status, uf, cidade, bairro, criado_em FROM posts WHERE usuario_id = ?', [$u['id']]),
        'comentarios' => todos('SELECT id, post_id, texto, criado_em FROM comentarios WHERE usuario_id = ?', [$u['id']]),
        'eventos' => todos('SELECT id, titulo, inicio, local_nome, status FROM eventos WHERE usuario_id = ?', [$u['id']]),
        'acessos' => todos('SELECT ip, acao, criado_em FROM log_acesso WHERE usuario_id = ? ORDER BY id DESC LIMIT 200', [$u['id']]),
    ]);
}

// LGPD art. 18: eliminação. Apaga conteúdo e arquivos; mantém só o registro de acesso exigido pelo Marco Civil.
function r_apagar_conta(): void {
    $u = exigir_login();
    $d = entrada();
    if (($d['confirmo'] ?? '') !== 'APAGAR') erro(422, 'Digite APAGAR para confirmar.');
    foreach (todos('SELECT id FROM posts WHERE usuario_id = ?', [$u['id']]) as $p) apagar_arquivos_do_post((int) $p['id']);
    q('DELETE FROM posts WHERE usuario_id = ?', [$u['id']]);
    q('DELETE FROM comentarios WHERE usuario_id = ?', [$u['id']]);
    q('DELETE FROM apoios WHERE usuario_id = ?', [$u['id']]);
    q('DELETE FROM presencas WHERE usuario_id = ?', [$u['id']]);
    q("UPDATE eventos SET status = 'removido', descricao = NULL WHERE usuario_id = ?", [$u['id']]);
    q("UPDATE usuarios SET status = 'apagado', email = '', nome = 'Conta apagada', apelido = ?, foto_url = NULL, bio = NULL, nascimento = NULL, cidade = NULL, google_sub = ? WHERE id = ?",
      ['apagado' . $u['id'], 'apagado:' . hash('sha256', $u['google_sub']), $u['id']]);
    registrar_acesso((int) $u['id'], 'conta_apagada');
    $_SESSION = [];
    responder(['ok' => true]);
}

function r_pedir_verificacao(): void {
    $u = exigir_login();
    if ($u['idade_verificada']) responder(['ok' => true, 'ja' => true]);
    limitar('verif:' . $u['id'], 3, 86400);
    try {
        inserir('denuncias', ['alvo_tipo' => 'usuario', 'alvo_id' => $u['id'], 'usuario_id' => $u['id'], 'motivo' => 'verificacao',
                              'detalhe' => txt(entrada(), 'mensagem', 500), 'criado_em' => agora()]);
    } catch (Throwable $e) { if (!eh_duplicado($e)) throw $e; }
    responder(['ok' => true]);
}

function r_usuario(): void {
    $eu = usuario();
    $ap = mb_strtolower((string) ($_GET['apelido'] ?? ''));
    $u = um("SELECT * FROM usuarios WHERE apelido = ? AND status IN ('ativo','suspenso')", [$ap]);
    if (!$u) erro(404, 'Perfil não encontrado.');
    $proprio = $eu && (int) $eu['id'] === (int) $u['id'];
    $cond = $proprio || eh_mod($eu) ? "p.status IN ('publicado','pendente')" : "p.status = 'publicado'";
    $posts = todos(SQL_POST . " WHERE p.usuario_id = ? AND $cond AND p.tipo <> 'story' ORDER BY p.id DESC LIMIT 30", [$u['id']]);
    $n = um("SELECT COUNT(*) AS n FROM posts WHERE usuario_id = ? AND status = 'publicado'", [$u['id']]);
    responder(['usuario' => publico_usuario($u) + ['desde' => substr($u['criado_em'], 0, 10), 'publicacoes' => (int) $n['n']], 'posts' => montar_posts($posts, $eu)]);
}

/* ---------------- feed, stories e reels ---------------- */
function r_feed(): void {
    $eu = usuario();
    $w = ["p.status = 'publicado'", "p.tipo <> 'story'"]; $p = [];
    $tipo = $_GET['tipo'] ?? '';
    if ($tipo === 'oficial') $w[] = 'p.oficial = 1';
    elseif (in_array($tipo, ['texto', 'foto', 'video', 'reel'], true)) { $w[] = 'p.tipo = ?'; $p[] = $tipo; }
    if (!empty($_GET['uf'])) { $w[] = 'p.uf = ?'; $p[] = uf_valida((string) $_GET['uf']); }
    if (!empty($_GET['cidade'])) { $w[] = 'p.cidade = ?'; $p[] = mb_substr((string) $_GET['cidade'], 0, 80); }
    if (!empty($_GET['evento'])) { $w[] = 'p.evento_id = ?'; $p[] = (int) $_GET['evento']; }
    if (!empty($_GET['antes'])) { $w[] = 'p.id < ?'; $p[] = (int) $_GET['antes']; }
    $linhas = todos(SQL_POST . ' WHERE ' . implode(' AND ', $w) . ' ORDER BY p.id DESC LIMIT 20', $p);
    // Meus posts aguardando aprovação aparecem só para mim, no topo
    $meus = [];
    if ($eu && empty($_GET['antes']) && !$tipo) {
        $meus = todos(SQL_POST . " WHERE p.usuario_id = ? AND p.status = 'pendente' AND p.tipo <> 'story' ORDER BY p.id DESC LIMIT 5", [$eu['id']]);
    }
    responder(['posts' => montar_posts(array_merge($meus, $linhas), $eu), 'fim' => count($linhas) < 20]);
}

function r_stories(): void {
    $eu = usuario();
    $linhas = todos(SQL_POST . " WHERE p.tipo = 'story' AND p.status = 'publicado' AND p.expira_em > ? ORDER BY p.id DESC LIMIT 100", [agora()]);
    $grupos = [];
    foreach (montar_posts($linhas, $eu) as $s) {
        $k = $s['autor']['id'];
        $grupos[$k] ??= ['autor' => $s['autor'], 'stories' => []];
        array_unshift($grupos[$k]['stories'], $s);   // mais antigo primeiro, como nas redes
    }
    responder(['grupos' => array_values($grupos)]);
}

function r_post(): void {
    $eu = usuario();
    $id = (int) ($_GET['id'] ?? 0);
    $p = um(SQL_POST . ' WHERE p.id = ?', [$id]);
    if (!$p || ($p['status'] !== 'publicado' && !($eu && ((int) $eu['id'] === (int) $p['usuario_id'] || eh_mod($eu))))) erro(404, 'Publicação não encontrada.');
    responder(['post' => montar_posts([$p], $eu)[0]]);
}

function r_post_criar(): void {
    $u = exigir_ativo();
    pode_publicar($u);
    $d = entrada();
    $tipo = (string) ($d['tipo'] ?? 'texto');
    if (!in_array($tipo, TIPOS_POST, true)) erro(422, 'Tipo de publicação inválido.');
    limitar('post:' . $u['id'], 10, 3600, 'Você publicou muito em pouco tempo. Espere um pouco.');
    limitar('post-dia:' . $u['id'], 40, 86400, 'Limite diário de publicações atingido.');

    $texto = txt($d, 'texto', 3000, $tipo === 'texto');
    $analise = analisar_texto($texto, $u);
    [$status, $motivo] = status_inicial($tipo, $analise, $u);
    if ($status === 'bloquear') {
        log_mod(null, 'bloqueio_automatico', 'post', 0, $motivo . ' | usuario ' . $u['id']);
        erro(422, "Sua publicação não foi aceita: $motivo. Leia as regras da comunidade.", ['bloqueado' => true]);
    }
    $evento = inteiro($d, 'evento_id');
    if ($evento && !um("SELECT id FROM eventos WHERE id = ? AND status = 'publicado'", [$evento])) erro(422, 'Evento não encontrado.');
    $lat = coord($d, 'lat', 90); $lng = coord($d, 'lng', 180);
    if (($lat === null) !== ($lng === null)) erro(422, 'Localização incompleta.');

    $midias = receber_midias($u, $tipo);
    if ($tipo !== 'texto' && !$midias) erro(422, 'Escolha uma foto ou vídeo para este tipo de publicação.');

    $id = inserir('posts', [
        'usuario_id' => $u['id'], 'tipo' => $tipo, 'texto' => $texto, 'evento_id' => $evento, 'lat' => $lat, 'lng' => $lng,
        'uf' => uf_valida(txt($d, 'uf', 2)), 'cidade' => txt($d, 'cidade', 80), 'bairro' => txt($d, 'bairro', 80),
        'status' => $status, 'motivo' => $motivo, 'expira_em' => $tipo === 'story' ? agora(86400) : null, 'criado_em' => agora(),
    ]);
    foreach ($midias as $m) inserir('midias', $m + ['post_id' => $id]);
    if ($status === 'pendente' && $analise['acao'] === 'revisar') log_mod(null, 'filtro_revisar', 'post', $id, $motivo);
    registrar_acesso((int) $u['id'], 'post');
    $p = um(SQL_POST . ' WHERE p.id = ?', [$id]);
    responder(['ok' => true, 'post' => montar_posts([$p], $u)[0],
               'aviso' => $status === 'pendente' ? 'Recebemos! Sua publicação vai aparecer depois que a moderação aprovar.' : null], 201);
}

function r_post_apagar(): void {
    $u = exigir_login();
    $id = (int) (entrada()['id'] ?? 0);
    $p = um('SELECT * FROM posts WHERE id = ?', [$id]);
    if (!$p) erro(404, 'Publicação não encontrada.');
    $dono = (int) $p['usuario_id'] === (int) $u['id'];
    if (!$dono && !eh_mod($u)) erro(403, 'Você só pode apagar o que publicou.');
    if ($dono) {
        apagar_arquivos_do_post($id);
        q('DELETE FROM posts WHERE id = ?', [$id]);
    } else {
        q("UPDATE posts SET status = 'removido', motivo = ? WHERE id = ?", [txt(entrada(), 'motivo', 300) ?? 'removido pela moderação', $id]);
        log_mod((int) $u['id'], 'remover', 'post', $id, txt(entrada(), 'motivo', 300));
    }
    responder(['ok' => true]);
}

function r_post_editar(): void {
    $u = exigir_ativo();
    $d = entrada();
    $id = (int) ($d['id'] ?? 0);
    $p = um('SELECT * FROM posts WHERE id = ?', [$id]);
    if (!$p || (int) $p['usuario_id'] !== (int) $u['id']) erro(403, 'Você só pode editar o que publicou.');
    $texto = txt($d, 'texto', 3000, $p['tipo'] === 'texto');
    $a = analisar_texto($texto, $u);
    if ($a['acao'] === 'bloquear') erro(422, 'A edição não foi aceita: ' . $a['motivo'] . '.');
    $status = $a['acao'] === 'revisar' ? 'pendente' : $p['status'];
    q('UPDATE posts SET texto = ?, status = ?, motivo = ?, editado_em = ? WHERE id = ?', [$texto, $status, $a['acao'] === 'revisar' ? $a['motivo'] : $p['motivo'], agora(), $id]);
    responder(['ok' => true, 'status' => $status]);
}

function r_apoiar(): void {
    $u = exigir_ativo();
    $id = (int) (entrada()['post_id'] ?? 0);
    if (!um("SELECT id FROM posts WHERE id = ? AND status = 'publicado'", [$id])) erro(404, 'Publicação não encontrada.');
    limitar('apoio:' . $u['id'], 300, 3600);
    $ja = um('SELECT 1 AS x FROM apoios WHERE post_id = ? AND usuario_id = ?', [$id, $u['id']]);
    if ($ja) {
        q('DELETE FROM apoios WHERE post_id = ? AND usuario_id = ?', [$id, $u['id']]);
        q('UPDATE posts SET apoios = CASE WHEN apoios > 0 THEN apoios - 1 ELSE 0 END WHERE id = ?', [$id]);
    } else {
        inserir('apoios', ['post_id' => $id, 'usuario_id' => $u['id'], 'criado_em' => agora()]);
        q('UPDATE posts SET apoios = apoios + 1 WHERE id = ?', [$id]);
    }
    $n = um('SELECT apoios FROM posts WHERE id = ?', [$id]);
    responder(['apoiei' => !$ja, 'apoios' => (int) $n['apoios']]);
}

function r_comentarios(): void {
    $eu = usuario();
    $id = (int) ($_GET['post_id'] ?? 0);
    $lista = todos("SELECT c.id, c.texto, c.criado_em, c.status, c.usuario_id, u.apelido, u.nome, u.foto_url, u.papel FROM comentarios c
                    JOIN usuarios u ON u.id = c.usuario_id WHERE c.post_id = ? AND (c.status = 'publicado' OR c.usuario_id = ?) ORDER BY c.id LIMIT 200",
                   [$id, $eu['id'] ?? 0]);
    responder(['comentarios' => array_map(fn($c) => ['id' => (int) $c['id'], 'texto' => $c['texto'], 'criado_em' => $c['criado_em'], 'status' => $c['status'],
        'autor' => ['id' => (int) $c['usuario_id'], 'apelido' => $c['apelido'], 'nome' => $c['nome'], 'foto' => $c['foto_url'], 'papel' => $c['papel']],
        'meu' => $eu && (int) $eu['id'] === (int) $c['usuario_id']], $lista)]);
}

function r_comentar(): void {
    $u = exigir_ativo();
    pode_publicar($u);
    $d = entrada();
    $id = (int) ($d['post_id'] ?? 0);
    if (!um("SELECT id FROM posts WHERE id = ? AND status = 'publicado'", [$id])) erro(404, 'Publicação não encontrada.');
    limitar('coment:' . $u['id'], 30, 3600, 'Muitos comentários em pouco tempo. Respira e volta daqui a pouco.');
    $texto = txt($d, 'texto', 1000, true);
    $a = analisar_texto($texto, $u);
    [$status, $motivo] = status_inicial('comentario', $a, $u);
    if ($status === 'bloquear') erro(422, "Comentário não aceito: $motivo.", ['bloqueado' => true]);
    $cid = inserir('comentarios', ['post_id' => $id, 'usuario_id' => $u['id'], 'texto' => $texto, 'status' => $status, 'criado_em' => agora()]);
    if ($status === 'publicado') q('UPDATE posts SET comentarios = comentarios + 1 WHERE id = ?', [$id]);
    else log_mod(null, 'filtro_revisar', 'comentario', $cid, $motivo);
    responder(['ok' => true, 'id' => $cid, 'status' => $status, 'aviso' => $status === 'pendente' ? 'Seu comentário vai para a moderação antes de aparecer.' : null], 201);
}

function r_comentario_apagar(): void {
    $u = exigir_login();
    $id = (int) (entrada()['id'] ?? 0);
    $c = um('SELECT * FROM comentarios WHERE id = ?', [$id]);
    if (!$c) erro(404, 'Comentário não encontrado.');
    if ((int) $c['usuario_id'] !== (int) $u['id'] && !eh_mod($u)) erro(403, 'Você só pode apagar seus comentários.');
    q('DELETE FROM comentarios WHERE id = ?', [$id]);
    if ($c['status'] === 'publicado') q('UPDATE posts SET comentarios = CASE WHEN comentarios > 0 THEN comentarios - 1 ELSE 0 END WHERE id = ?', [$c['post_id']]);
    if (eh_mod($u) && (int) $c['usuario_id'] !== (int) $u['id']) log_mod((int) $u['id'], 'remover', 'comentario', $id, null);
    responder(['ok' => true]);
}

/* ---------------- eventos e mapa ---------------- */
function r_evento_criar(): void {
    $u = exigir_ativo();
    pode_publicar($u);
    limitar('evento:' . $u['id'], 5, 86400, 'Limite de 5 eventos por dia.');
    $d = entrada();
    $titulo = txt($d, 'titulo', 120, true);
    $desc = txt($d, 'descricao', 3000);
    $a = analisar_texto($titulo . "\n" . $desc, $u);
    [$status, $motivo] = status_inicial('evento', $a, $u);
    if ($status === 'bloquear') erro(422, "Evento não aceito: $motivo.", ['bloqueado' => true]);
    $inicio = DateTime::createFromFormat('Y-m-d\TH:i', (string) ($d['inicio'] ?? ''));
    if (!$inicio) erro(422, 'Informe data e hora de início.');
    if ($inicio < new DateTime('-1 day') || $inicio > new DateTime('+1 year')) erro(422, 'A data do evento precisa estar entre hoje e daqui a um ano.');
    $fim = !empty($d['fim']) ? DateTime::createFromFormat('Y-m-d\TH:i', (string) $d['fim']) : null;
    if ($fim && $fim < $inicio) erro(422, 'O fim não pode ser antes do início.');
    $lat = coord($d, 'lat', 90); $lng = coord($d, 'lng', 180);
    if ($lat === null || $lng === null) erro(422, 'Marque o local do evento no mapa.');
    if ($lat < -34.5 || $lat > 6 || $lng < -74.5 || $lng > -28) erro(422, 'O local precisa ficar no Brasil.');
    $id = inserir('eventos', [
        'usuario_id' => $u['id'], 'titulo' => $titulo, 'descricao' => $desc, 'inicio' => $inicio->format('Y-m-d H:i:s'),
        'fim' => $fim ? $fim->format('Y-m-d H:i:s') : null, 'local_nome' => txt($d, 'local_nome', 120), 'lat' => $lat, 'lng' => $lng,
        'uf' => uf_valida(txt($d, 'uf', 2)), 'cidade' => txt($d, 'cidade', 80), 'bairro' => txt($d, 'bairro', 80),
        'link' => url_valida(txt($d, 'link', 500)), 'status' => $status, 'motivo' => $motivo, 'criado_em' => agora(),
    ]);
    registrar_acesso((int) $u['id'], 'evento');
    responder(['ok' => true, 'id' => $id, 'status' => $status,
               'aviso' => $status === 'pendente' ? 'Evento recebido! Ele aparece no mapa depois que a moderação aprovar.' : null], 201);
}

function r_evento(): void {
    $eu = usuario();
    $e = um('SELECT e.*, u.apelido, u.nome, u.foto_url FROM eventos e JOIN usuarios u ON u.id = e.usuario_id WHERE e.id = ?', [(int) ($_GET['id'] ?? 0)]);
    if (!$e || ($e['status'] !== 'publicado' && !($eu && ((int) $eu['id'] === (int) $e['usuario_id'] || eh_mod($eu))))) erro(404, 'Evento não encontrado.');
    $posts = todos(SQL_POST . " WHERE p.evento_id = ? AND p.status = 'publicado' AND p.tipo <> 'story' ORDER BY p.id DESC LIMIT 60", [$e['id']]);
    responder(['evento' => montar_evento($e, $eu), 'registros' => montar_posts($posts, $eu)]);
}

function r_presenca(): void {
    $u = exigir_ativo();
    $id = (int) (entrada()['evento_id'] ?? 0);
    if (!um("SELECT id FROM eventos WHERE id = ? AND status = 'publicado'", [$id])) erro(404, 'Evento não encontrado.');
    $ja = um('SELECT 1 AS x FROM presencas WHERE evento_id = ? AND usuario_id = ?', [$id, $u['id']]);
    if ($ja) {
        q('DELETE FROM presencas WHERE evento_id = ? AND usuario_id = ?', [$id, $u['id']]);
        q('UPDATE eventos SET presencas = CASE WHEN presencas > 0 THEN presencas - 1 ELSE 0 END WHERE id = ?', [$id]);
    } else {
        inserir('presencas', ['evento_id' => $id, 'usuario_id' => $u['id'], 'criado_em' => agora()]);
        q('UPDATE eventos SET presencas = presencas + 1 WHERE id = ?', [$id]);
    }
    $n = um('SELECT presencas FROM eventos WHERE id = ?', [$id]);
    responder(['vou' => !$ja, 'presencas' => (int) $n['presencas']]);
}

// Pontos do mapa: eventos e registros (fotos, vídeos, reels) com localização. Filtra pela área visível.
function r_mapa(): void {
    $b = array_map('floatval', explode(',', (string) ($_GET['bbox'] ?? '-75,-35,-28,7')));
    if (count($b) !== 4) erro(422, 'Área inválida.');
    [$o, $s, $l, $n] = $b;
    $periodo = (string) ($_GET['periodo'] ?? 'proximos');
    $we = ["status = 'publicado'", 'lat BETWEEN ? AND ?', 'lng BETWEEN ? AND ?'];
    $pe = [$s, $n, $o, $l];
    if ($periodo === 'proximos') { $we[] = '(COALESCE(fim, inicio) >= ?)'; $pe[] = agora(-6 * 3600); }
    elseif ($periodo === 'passados') { $we[] = 'inicio < ?'; $pe[] = agora(); }
    $eventos = todos('SELECT id, titulo, inicio, local_nome, lat, lng, uf, cidade, bairro, presencas FROM eventos WHERE ' . implode(' AND ', $we) . ' ORDER BY inicio LIMIT 1000', $pe);
    $registros = [];
    if (($_GET['registros'] ?? '1') === '1') {
        $registros = todos("SELECT p.id, p.tipo, p.lat, p.lng, p.cidade, p.bairro, p.criado_em, p.evento_id,
                              (SELECT arquivo FROM midias m WHERE m.post_id = p.id ORDER BY ordem LIMIT 1) AS arquivo,
                              (SELECT tipo FROM midias m WHERE m.post_id = p.id ORDER BY ordem LIMIT 1) AS midia_tipo
                            FROM posts p WHERE p.status = 'publicado' AND p.lat IS NOT NULL AND p.tipo IN ('foto','video','reel')
                              AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ? ORDER BY p.id DESC LIMIT 1000", [$s, $n, $o, $l]);
    }
    responder([
        'eventos' => array_map(fn($e) => ['id' => (int) $e['id'], 'titulo' => $e['titulo'], 'inicio' => $e['inicio'], 'local_nome' => $e['local_nome'],
            'lat' => (float) $e['lat'], 'lng' => (float) $e['lng'], 'uf' => $e['uf'], 'cidade' => $e['cidade'], 'bairro' => $e['bairro'], 'presencas' => (int) $e['presencas']], $eventos),
        'registros' => array_map(fn($r) => ['id' => (int) $r['id'], 'tipo' => $r['tipo'], 'lat' => (float) $r['lat'], 'lng' => (float) $r['lng'],
            'cidade' => $r['cidade'], 'bairro' => $r['bairro'], 'criado_em' => $r['criado_em'], 'evento_id' => $r['evento_id'] ? (int) $r['evento_id'] : null,
            'capa' => $r['arquivo'] && $r['midia_tipo'] === 'imagem' ? url_midia($r['arquivo']) : null,
            'video' => $r['arquivo'] && $r['midia_tipo'] === 'video' ? url_midia($r['arquivo']) : null], $registros),
    ]);
}

// Números por estado (para o mapa no zoom do Brasil)
function r_resumo_regioes(): void {
    $ev = todos("SELECT uf, COUNT(*) AS n FROM eventos WHERE status = 'publicado' AND uf IS NOT NULL AND COALESCE(fim, inicio) >= ? GROUP BY uf", [agora(-6 * 3600)]);
    $rg = todos("SELECT uf, COUNT(*) AS n FROM posts WHERE status = 'publicado' AND uf IS NOT NULL AND tipo <> 'story' GROUP BY uf");
    $r = [];
    foreach ($ev as $x) $r[$x['uf']]['eventos'] = (int) $x['n'];
    foreach ($rg as $x) $r[$x['uf']]['registros'] = (int) $x['n'];
    responder(['ufs' => $r]);
}

/* ---------------- denúncias ---------------- */
function r_denunciar(): void {
    $u = usuario();
    $d = entrada();
    $tipo = (string) ($d['alvo_tipo'] ?? '');
    if (!in_array($tipo, ['post', 'comentario', 'evento', 'usuario'], true)) erro(422, 'Alvo inválido.');
    $motivo = (string) ($d['motivo'] ?? '');
    if (!isset(MOTIVOS_DENUNCIA[$motivo])) erro(422, 'Escolha o motivo da denúncia.');
    $alvo = (int) ($d['alvo_id'] ?? 0);
    $tabela = ['post' => 'posts', 'comentario' => 'comentarios', 'evento' => 'eventos', 'usuario' => 'usuarios'][$tipo];
    if (!um("SELECT id FROM $tabela WHERE id = ?", [$alvo])) erro(404, 'Conteúdo não encontrado.');
    $contato = null;
    if (!$u) {   // notificação de quem não tem conta (vítima, representante): precisa de e-mail para retorno
        $contato = txt($d, 'contato', 190, true);
        if (!filter_var($contato, FILTER_VALIDATE_EMAIL)) erro(422, 'Informe um e-mail válido para retorno.');
    }
    limitar('denuncia:' . ($u['id'] ?? ip()), 20, 86400);
    try {
        inserir('denuncias', ['alvo_tipo' => $tipo, 'alvo_id' => $alvo, 'usuario_id' => $u['id'] ?? null, 'contato' => $contato, 'motivo' => $motivo,
                              'detalhe' => txt($d, 'detalhe', 1000), 'criado_em' => agora()]);
    } catch (Throwable $e) {
        if (eh_duplicado($e)) responder(['ok' => true, 'repetida' => true]);
        throw $e;
    }
    // Várias pessoas denunciando a mesma publicação: ela sai do ar até a moderação olhar.
    if ($tipo === 'post') {
        q('UPDATE posts SET denuncias = denuncias + 1 WHERE id = ?', [$alvo]);
        $n = um("SELECT COUNT(DISTINCT COALESCE(usuario_id, contato)) AS n FROM denuncias WHERE alvo_tipo = 'post' AND alvo_id = ? AND status = 'aberta'", [$alvo]);
        $grave = in_array($motivo, ['menores', 'violencia', 'antidemocratico'], true);
        if ((int) $n['n'] >= (int) cfg('denuncias_para_ocultar') || ($grave && $u && in_array($u['papel'], ['confiavel', 'moderador', 'admin'], true))) {
            q("UPDATE posts SET status = 'pendente', motivo = ? WHERE id = ? AND status = 'publicado'", ['ocultado por denúncias: ' . MOTIVOS_DENUNCIA[$motivo], $alvo]);
            log_mod(null, 'ocultar_por_denuncias', 'post', $alvo, MOTIVOS_DENUNCIA[$motivo]);
        }
    }
    responder(['ok' => true], 201);
}
