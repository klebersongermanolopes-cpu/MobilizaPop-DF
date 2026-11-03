<?php
// Rotas do painel de administração e moderação.
declare(strict_types=1);
if (!defined('MP_API')) { http_response_code(404); exit; }

function r_admin_resumo(): void {
    exigir_mod();
    $c = fn($sql, $p = []) => (int) (um($sql, $p)['n'] ?? 0);
    responder([
        'posts_pendentes' => $c("SELECT COUNT(*) AS n FROM posts WHERE status = 'pendente'"),
        'eventos_pendentes' => $c("SELECT COUNT(*) AS n FROM eventos WHERE status = 'pendente'"),
        'comentarios_pendentes' => $c("SELECT COUNT(*) AS n FROM comentarios WHERE status = 'pendente'"),
        'denuncias_abertas' => $c("SELECT COUNT(*) AS n FROM denuncias WHERE status = 'aberta' AND motivo <> 'verificacao'"),
        'verificacoes' => $c("SELECT COUNT(*) AS n FROM denuncias WHERE status = 'aberta' AND motivo = 'verificacao'"),
        'usuarios' => $c("SELECT COUNT(*) AS n FROM usuarios WHERE status = 'ativo'"),
        'usuarios_7d' => $c('SELECT COUNT(*) AS n FROM usuarios WHERE criado_em >= ?', [agora(-7 * 86400)]),
        'posts_7d' => $c("SELECT COUNT(*) AS n FROM posts WHERE criado_em >= ?", [agora(-7 * 86400)]),
        'eventos_futuros' => $c("SELECT COUNT(*) AS n FROM eventos WHERE status = 'publicado' AND inicio >= ?", [agora()]),
    ]);
}

function r_admin_fila(): void {
    $eu = exigir_mod();
    $posts = montar_posts(todos(SQL_POST . " WHERE p.status = 'pendente' ORDER BY p.id LIMIT 50"), $eu);
    $eventos = array_map(fn($e) => montar_evento($e, $eu),
        todos("SELECT e.*, u.apelido, u.nome, u.foto_url FROM eventos e JOIN usuarios u ON u.id = e.usuario_id WHERE e.status = 'pendente' ORDER BY e.id LIMIT 50"));
    $coms = todos("SELECT c.id, c.post_id, c.texto, c.criado_em, u.apelido, u.nome FROM comentarios c JOIN usuarios u ON u.id = c.usuario_id WHERE c.status = 'pendente' ORDER BY c.id LIMIT 50");
    responder(['posts' => $posts, 'eventos' => $eventos, 'comentarios' => $coms]);
}

function r_admin_moderar(): void {
    $eu = exigir_mod();
    $d = entrada();
    $tipo = (string) ($d['alvo_tipo'] ?? '');
    $acao = (string) ($d['acao'] ?? '');
    $id = (int) ($d['alvo_id'] ?? 0);
    $motivo = txt($d, 'motivo', 300);
    $novo = ['aprovar' => 'publicado', 'rejeitar' => 'rejeitado', 'remover' => 'removido', 'restaurar' => 'publicado'][$acao] ?? null;
    $tabela = ['post' => 'posts', 'evento' => 'eventos', 'comentario' => 'comentarios'][$tipo] ?? null;
    if (!$novo || !$tabela) erro(422, 'Ação inválida.');
    if (in_array($acao, ['rejeitar', 'remover'], true) && !$motivo) erro(422, 'Explique o motivo: ele aparece para quem publicou.');
    $antes = um("SELECT status" . ($tipo === 'comentario' ? ', post_id' : '') . " FROM $tabela WHERE id = ?", [$id]);
    if (!$antes) erro(404, 'Item não encontrado.');
    if ($tipo === 'comentario') {
        q('UPDATE comentarios SET status = ? WHERE id = ?', [$novo, $id]);
        if ($antes['status'] !== 'publicado' && $novo === 'publicado') q('UPDATE posts SET comentarios = comentarios + 1 WHERE id = ?', [$antes['post_id']]);
        if ($antes['status'] === 'publicado' && $novo !== 'publicado') q('UPDATE posts SET comentarios = CASE WHEN comentarios > 0 THEN comentarios - 1 ELSE 0 END WHERE id = ?', [$antes['post_id']]);
    } else {
        q("UPDATE $tabela SET status = ?, motivo = ? WHERE id = ?", [$novo, $motivo, $id]);
    }
    // Decidiu sobre o item: fecha as denúncias abertas sobre ele
    $decisao = in_array($acao, ['rejeitar', 'remover'], true) ? 'procedente' : 'improcedente';
    q("UPDATE denuncias SET status = ?, resolvido_por = ?, resolvido_em = ? WHERE alvo_tipo = ? AND alvo_id = ? AND status = 'aberta'", [$decisao, $eu['id'], agora(), $tipo, $id]);
    log_mod((int) $eu['id'], $acao, $tipo, $id, $motivo);
    responder(['ok' => true, 'status' => $novo]);
}

function r_admin_denuncias(): void {
    exigir_mod();
    $status = in_array($_GET['status'] ?? '', ['aberta', 'procedente', 'improcedente'], true) ? $_GET['status'] : 'aberta';
    $lista = todos("SELECT d.*, u.apelido AS denunciante FROM denuncias d LEFT JOIN usuarios u ON u.id = d.usuario_id
                    WHERE d.status = ? ORDER BY d.id DESC LIMIT 100", [$status]);
    foreach ($lista as &$d) {
        $d['alvo'] = match ($d['alvo_tipo']) {
            'post' => um('SELECT p.id, p.tipo, p.texto, p.status, u.apelido FROM posts p JOIN usuarios u ON u.id = p.usuario_id WHERE p.id = ?', [$d['alvo_id']]),
            'comentario' => um('SELECT c.id, c.texto, c.status, c.post_id, u.apelido FROM comentarios c JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = ?', [$d['alvo_id']]),
            'evento' => um('SELECT id, titulo AS texto, status FROM eventos WHERE id = ?', [$d['alvo_id']]),
            'usuario' => um('SELECT id, apelido, nome, status, papel, idade_verificada, nascimento FROM usuarios WHERE id = ?', [$d['alvo_id']]),
            default => null,
        };
        $d['motivo_texto'] = MOTIVOS_DENUNCIA[$d['motivo']] ?? ($d['motivo'] === 'verificacao' ? 'Pedido de verificação de idade' : $d['motivo']);
    }
    responder(['denuncias' => $lista]);
}

function r_admin_denuncia_resolver(): void {
    $eu = exigir_mod();
    $d = entrada();
    $id = (int) ($d['id'] ?? 0);
    $dec = (string) ($d['decisao'] ?? '');
    if (!in_array($dec, ['procedente', 'improcedente'], true)) erro(422, 'Decisão inválida.');
    $den = um('SELECT * FROM denuncias WHERE id = ?', [$id]);
    if (!$den) erro(404, 'Denúncia não encontrada.');
    q('UPDATE denuncias SET status = ?, resolvido_por = ?, resolvido_em = ? WHERE id = ?', [$dec, $eu['id'], agora(), $id]);
    // Denúncia improcedente de post ocultado por denúncias: volta ao ar se não houver outras abertas
    if ($dec === 'improcedente' && $den['alvo_tipo'] === 'post') {
        $abertas = um("SELECT COUNT(*) AS n FROM denuncias WHERE alvo_tipo = 'post' AND alvo_id = ? AND status = 'aberta'", [$den['alvo_id']]);
        if ((int) $abertas['n'] === 0) q("UPDATE posts SET status = 'publicado', motivo = NULL WHERE id = ? AND status = 'pendente' AND motivo LIKE 'ocultado por denúncias%'", [$den['alvo_id']]);
    }
    log_mod((int) $eu['id'], 'denuncia_' . $dec, $den['alvo_tipo'], (int) $den['alvo_id'], 'denúncia ' . $id);
    responder(['ok' => true]);
}

function r_admin_usuarios(): void {
    exigir_mod();
    $busca = '%' . mb_substr((string) ($_GET['busca'] ?? ''), 0, 60) . '%';
    $lista = todos("SELECT id, apelido, nome, email, foto_url, papel, status, idade_verificada, nascimento, uf, cidade, criado_em, ultimo_acesso,
                      (SELECT COUNT(*) FROM posts p WHERE p.usuario_id = usuarios.id) AS posts,
                      (SELECT COUNT(*) FROM denuncias d WHERE d.alvo_tipo = 'usuario' AND d.alvo_id = usuarios.id AND d.status = 'procedente') AS strikes
                    FROM usuarios WHERE status <> 'apagado' AND (apelido LIKE ? OR nome LIKE ? OR email LIKE ?) ORDER BY id DESC LIMIT 100", [$busca, $busca, $busca]);
    responder(['usuarios' => $lista]);
}

function r_admin_usuario(): void {
    $eu = exigir_mod();
    $d = entrada();
    $id = (int) ($d['id'] ?? 0);
    $alvo = um('SELECT * FROM usuarios WHERE id = ?', [$id]);
    if (!$alvo) erro(404, 'Pessoa não encontrada.');
    if ((int) $alvo['id'] === (int) $eu['id'] && isset($d['papel'])) erro(422, 'Você não pode mudar o seu próprio papel.');
    if ($alvo['papel'] === 'admin' && !eh_admin($eu)) erro(403, 'Só administradores mexem em administradores.');
    $mud = [];
    if (isset($d['papel'])) {
        if (!eh_admin($eu)) erro(403, 'Só administradores mudam papéis.');
        if (!in_array($d['papel'], ['membro', 'confiavel', 'moderador', 'admin'], true)) erro(422, 'Papel inválido.');
        $mud['papel'] = $d['papel'];
    }
    if (isset($d['status'])) {
        if (!in_array($d['status'], ['ativo', 'suspenso', 'banido'], true)) erro(422, 'Situação inválida.');
        if ($d['status'] === 'banido' && !eh_admin($eu)) erro(403, 'Só administradores banem contas.');
        $mud['status'] = $d['status'];
    }
    if (isset($d['idade_verificada'])) $mud['idade_verificada'] = $d['idade_verificada'] ? 1 : 0;
    if (!$mud) erro(422, 'Nada para mudar.');
    $sets = implode(', ', array_map(fn($c) => "$c = ?", array_keys($mud)));
    q("UPDATE usuarios SET $sets WHERE id = ?", array_merge(array_values($mud), [$id]));
    if (isset($mud['idade_verificada'])) {
        q("UPDATE denuncias SET status = 'procedente', resolvido_por = ?, resolvido_em = ? WHERE alvo_tipo = 'usuario' AND alvo_id = ? AND motivo = 'verificacao' AND status = 'aberta'", [$eu['id'], agora(), $id]);
    }
    // Banida: tudo que a pessoa publicou sai do ar
    if (($mud['status'] ?? '') === 'banido') {
        q("UPDATE posts SET status = 'removido', motivo = 'conta banida' WHERE usuario_id = ? AND status IN ('publicado','pendente')", [$id]);
        q("UPDATE eventos SET status = 'removido', motivo = 'conta banida' WHERE usuario_id = ? AND status IN ('publicado','pendente')", [$id]);
    }
    log_mod((int) $eu['id'], 'usuario:' . json_encode($mud), 'usuario', $id, txt($d, 'motivo', 300));
    responder(['ok' => true]);
}

/* Publicações oficiais da equipe: aparecem com selo "Mobiliza Pop" e exigem fonte (regra editorial). */
function r_admin_oficial_salvar(): void {
    $eu = exigir_admin();
    $d = entrada();
    $id = inteiro($d, 'id');
    $titulo = txt($d, 'titulo', 140, true);
    $texto = txt($d, 'texto', 8000, true);
    $fonte = url_valida(txt($d, 'fonte_url', 500, true));
    $campos = ['titulo' => $titulo, 'texto' => $texto, 'fonte_url' => $fonte, 'uf' => uf_valida(txt($d, 'uf', 2)), 'cidade' => txt($d, 'cidade', 80)];
    if ($id) {
        $p = um('SELECT id FROM posts WHERE id = ? AND oficial = 1', [$id]);
        if (!$p) erro(404, 'Publicação oficial não encontrada.');
        $midias = receber_midias($eu, 'foto');
        if ($midias) { apagar_arquivos_do_post($id); q('DELETE FROM midias WHERE post_id = ?', [$id]); }
        $sets = implode(', ', array_map(fn($c) => "$c = ?", array_keys($campos)));
        q("UPDATE posts SET $sets, editado_em = ?, status = 'publicado' WHERE id = ?", array_merge(array_values($campos), [agora(), $id]));
        log_mod((int) $eu['id'], 'oficial_editar', 'post', $id, $titulo);
    } else {
        $midias = receber_midias($eu, 'foto');
        $id = inserir('posts', $campos + ['usuario_id' => $eu['id'], 'tipo' => $midias ? 'foto' : 'texto', 'oficial' => 1, 'status' => 'publicado', 'criado_em' => agora()]);
        log_mod((int) $eu['id'], 'oficial_criar', 'post', $id, $titulo);
    }
    foreach ($midias as $m) inserir('midias', $m + ['post_id' => $id]);
    responder(['ok' => true, 'id' => $id]);
}

function r_admin_oficial_apagar(): void {
    $eu = exigir_admin();
    $id = (int) (entrada()['id'] ?? 0);
    if (!um('SELECT id FROM posts WHERE id = ? AND oficial = 1', [$id])) erro(404, 'Publicação oficial não encontrada.');
    apagar_arquivos_do_post($id);
    q('DELETE FROM posts WHERE id = ?', [$id]);
    log_mod((int) $eu['id'], 'oficial_apagar', 'post', $id, null);
    responder(['ok' => true]);
}

function r_admin_oficiais(): void {
    $eu = exigir_mod();
    responder(['posts' => montar_posts(todos(SQL_POST . ' WHERE p.oficial = 1 ORDER BY p.id DESC LIMIT 100'), $eu)]);
}

function r_admin_log(): void {
    exigir_admin();
    responder(['log' => todos('SELECT l.*, u.apelido AS moderador FROM log_moderacao l LEFT JOIN usuarios u ON u.id = l.moderador_id ORDER BY l.id DESC LIMIT 200')]);
}

// Limpeza: apaga registros de acesso com mais de 6 meses (prazo do Marco Civil) e limites vencidos.
// Chamado pelo cron da Hostinger (ver LEIA-ME) ou pelo botão no painel.
function r_admin_limpeza(): void {
    if (PHP_SAPI !== 'cli') exigir_admin();
    $a = q('DELETE FROM log_acesso WHERE criado_em < ?', [date('Y-m-d H:i:s', strtotime('-6 months -1 day'))])->rowCount();
    $b = q('DELETE FROM limites WHERE expira_em < ?', [time()])->rowCount();
    $c = 0;
    foreach (todos("SELECT id FROM posts WHERE tipo = 'story' AND expira_em < ?", [agora(-7 * 86400)]) as $s) {   // stories somem do ar em 24h e do servidor em 7 dias
        apagar_arquivos_do_post((int) $s['id']); q('DELETE FROM posts WHERE id = ?', [$s['id']]); $c++;
    }
    responder(['ok' => true, 'acessos_apagados' => $a, 'limites_apagados' => $b, 'stories_apagados' => $c]);
}
