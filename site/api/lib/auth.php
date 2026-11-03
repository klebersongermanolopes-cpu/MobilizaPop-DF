<?php
// Login com Google: o navegador recebe um "ID token" assinado pelo Google; aqui o servidor confere
// com o próprio Google se ele é válido e se foi emitido para o NOSSO site (aud = client id).
declare(strict_types=1);
if (!defined('MP_API')) { http_response_code(404); exit; }

function verificar_token_google(string $token): array {
    $cid = cfg('google_client_id');
    if (!$cid) erro(503, 'Login com Google ainda não configurado no servidor.');

    // Modo de teste local (desligado em produção): token "teste:sub:email:nome"
    if (cfg('permitir_login_teste') && str_starts_with($token, 'teste:')) {
        [, $sub, $email, $nome] = array_pad(explode(':', $token, 4), 4, 'Teste');
        return ['sub' => $sub, 'email' => $email, 'name' => $nome, 'picture' => null, 'email_verified' => 'true', 'aud' => $cid];
    }
    if (strlen($token) > 4096 || !preg_match('/^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/', $token)) erro(400, 'Token inválido.');

    $ch = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($token));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_SSL_VERIFYPEER => true]);
    $corpo = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($status !== 200 || !$corpo) erro(401, 'O Google não confirmou seu login. Tente de novo.');
    $d = json_decode($corpo, true) ?: [];

    if (($d['aud'] ?? '') !== $cid) erro(401, 'Login emitido para outro site.');
    if (!in_array($d['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) erro(401, 'Emissor inválido.');
    if ((int) ($d['exp'] ?? 0) < time()) erro(401, 'Login expirado. Tente de novo.');
    if (($d['email_verified'] ?? '') !== 'true' && ($d['email_verified'] ?? null) !== true) erro(401, 'Seu e-mail do Google não está verificado.');
    return $d;
}

function gerar_apelido(string $nome): string {
    $base = mb_strtolower($nome);
    if (class_exists('Normalizer')) $base = Normalizer::normalize($base, Normalizer::FORM_D) ?: $base;
    $base = preg_replace('/\p{Mn}/u', '', $base) ?? '';
    $base = trim(preg_replace('/[^a-z0-9]+/', '', $base) ?? '', '');
    $base = substr($base ?: 'pessoa', 0, 20);
    $apelido = $base;
    for ($i = 0; $i < 20 && um('SELECT id FROM usuarios WHERE apelido = ?', [$apelido]); $i++) {
        $apelido = $base . random_int(10, 9999);
    }
    return $apelido;
}

function entrar_com_google(string $token): array {
    $g = verificar_token_google($token);
    $sub = (string) $g['sub'];
    $email = mb_strtolower((string) ($g['email'] ?? ''));
    $nome = mb_substr(trim((string) ($g['name'] ?? '')) ?: 'Pessoa', 0, 80);
    $foto = isset($g['picture']) && str_starts_with((string) $g['picture'], 'https://') ? mb_substr((string) $g['picture'], 0, 500) : null;

    $u = um('SELECT * FROM usuarios WHERE google_sub = ?', [$sub]);
    if ($u && $u['status'] === 'banido') erro(403, 'Esta conta foi banida por violar as regras da comunidade.');
    if ($u && $u['status'] === 'apagado') erro(403, 'Esta conta foi apagada a pedido do titular.');
    if (!$u) {
        $id = inserir('usuarios', ['google_sub' => $sub, 'email' => $email, 'nome' => $nome, 'apelido' => gerar_apelido($nome),
                                   'foto_url' => $foto, 'criado_em' => agora(), 'ultimo_acesso' => agora()]);
        $u = um('SELECT * FROM usuarios WHERE id = ?', [$id]);
    } else {
        q('UPDATE usuarios SET email = ?, foto_url = ?, ultimo_acesso = ? WHERE id = ?', [$email, $foto, agora(), $u['id']]);
    }
    // E-mails listados em "admins" na configuração viram administradores automaticamente.
    $admins = array_map('mb_strtolower', (array) cfg('admins'));
    if (in_array($email, $admins, true) && $u['papel'] !== 'admin') {
        q("UPDATE usuarios SET papel = 'admin', idade_verificada = 1 WHERE id = ?", [$u['id']]);
    }
    if (!defined('MP_TESTE')) session_regenerate_id(true);
    $_SESSION['uid'] = (int) $u['id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    registrar_acesso((int) $u['id'], 'login');
    return um('SELECT * FROM usuarios WHERE id = ?', [$u['id']]);
}
