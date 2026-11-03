<?php
// Mobiliza Pop: funções básicas da API (configuração, banco, sessão, segurança, respostas).
declare(strict_types=1);

if (!defined('MP_API')) { http_response_code(404); exit; }

date_default_timezone_set('America/Sao_Paulo');

/* ---------------- configuração ----------------
   O arquivo de configuração fica FORA da pasta pública (public_html), para ninguém conseguir baixá-lo.
   Modelo: banco/config.exemplo.php */
function cfg(?string $chave = null, $padrao = null) {
    static $c = null;
    if ($c === null) {
        $locais = array_filter([
            getenv('MP_CONFIG') ?: null,
            __DIR__ . '/../../../mobiliza-config.php',      // ao lado de public_html (recomendado)
            __DIR__ . '/../../../../mobiliza-config.php',
        ]);
        foreach ($locais as $arq) {
            if (is_file($arq)) { $c = require $arq; break; }
        }
        if (!is_array($c)) {
            erro(503, 'A rede ainda não foi configurada no servidor (falta o arquivo mobiliza-config.php).');
        }
        $c += [
            'google_client_id'        => '',
            'admins'                  => [],
            'limite_imagem_mb'        => 10,
            'limite_video_mb'         => 100,
            'exigir_verificacao_idade'=> true,
            'idade_minima'            => 18,
            'denuncias_para_ocultar'  => 3,
            'pasta_uploads'           => __DIR__ . '/../../uploads',
            'url_uploads'             => '/uploads',
            'permitir_login_teste'    => false,
        ];
    }
    return $chave === null ? $c : ($c[$chave] ?? $padrao);
}

/* ---------------- banco ---------------- */
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $b = cfg('banco');
    try {
        if (!empty($b['dsn'])) {                  // usado nos testes automáticos (SQLite)
            $pdo = new PDO($b['dsn']);
        } else {
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $b['host'] ?? 'localhost', $b['porta'] ?? 3306, $b['nome']);
            $pdo = new PDO($dsn, $b['usuario'], $b['senha'], [PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '-03:00'"]);
        }
    } catch (Throwable $e) {
        error_log('[mobiliza] banco: ' . $e->getMessage());
        erro(503, 'Banco de dados fora do ar. Tente de novo em alguns minutos.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    return $pdo;
}
function q(string $sql, array $p = []): PDOStatement { $s = db()->prepare($sql); $s->execute($p); return $s; }
function um(string $sql, array $p = []): ?array { $r = q($sql, $p)->fetch(); return $r ?: null; }
function todos(string $sql, array $p = []): array { return q($sql, $p)->fetchAll(); }
function inserir(string $tabela, array $dados): int {
    $cols = array_keys($dados);
    q("INSERT INTO $tabela (" . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($dados));
    return (int) db()->lastInsertId();
}
function agora(int $mais = 0): string { return date('Y-m-d H:i:s', time() + $mais); }
function eh_duplicado(Throwable $e): bool {
    return $e instanceof PDOException && (in_array($e->getCode(), ['23000', '23505'], true) || stripos($e->getMessage(), 'UNIQUE') !== false);
}

/* ---------------- respostas ---------------- */
function responder($dados, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!defined('MP_TESTE')) exit;
    throw new RespostaEnviada();
}
function erro(int $status, string $msg, array $extra = []): void { responder(['erro' => $msg] + $extra, $status); }
class RespostaEnviada extends Exception {}

/* ---------------- entrada ---------------- */
function entrada(): array {
    static $d = null;
    if ($d !== null) return $d;
    $tipo = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($tipo, 'application/json') !== false) {
        $d = json_decode((string) ($GLOBALS['MP_CORPO'] ?? file_get_contents('php://input')), true) ?: [];
    } else {
        $d = $_POST;
    }
    return $d;
}
function txt(array $d, string $k, int $max, bool $obrig = false): ?string {
    $v = isset($d[$k]) && !is_array($d[$k]) ? trim((string) $d[$k]) : '';
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';   // tira caracteres de controle
    if ($v === '') { if ($obrig) erro(422, "Preencha o campo \"$k\"."); return null; }
    if (mb_strlen($v) > $max) erro(422, "O campo \"$k\" passou do limite de $max caracteres.");
    return $v;
}
function inteiro(array $d, string $k): ?int { return isset($d[$k]) && is_numeric($d[$k]) ? (int) $d[$k] : null; }
function coord(array $d, string $k, float $lim): ?float {
    if (!isset($d[$k]) || !is_numeric($d[$k])) return null;
    $v = (float) $d[$k];
    if ($v < -$lim || $v > $lim) erro(422, 'Coordenada inválida.');
    return round($v, 6);
}
function url_valida(?string $u): ?string {
    if ($u === null || $u === '') return null;
    if (!preg_match('#^https://#i', $u) || !filter_var($u, FILTER_VALIDATE_URL)) erro(422, 'Links precisam começar com https://');
    return $u;
}
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
function uf_valida(?string $uf): ?string {
    if ($uf === null || $uf === '') return null;
    $uf = strtoupper($uf);
    if (!in_array($uf, UFS, true)) erro(422, 'Estado inválido.');
    return $uf;
}

/* ---------------- rede / IP ---------------- */
function ip(): string {
    // Hostinger usa proxy reverso; confia no cabeçalho só se vier do próprio servidor/proxy configurado.
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $confiaveis = cfg('proxies_confiaveis', []);
    if ($confiaveis && in_array($ip, $confiaveis, true) && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
    }
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
}
function registrar_acesso(?int $uid, string $acao): void {
    try {
        inserir('log_acesso', ['usuario_id' => $uid, 'ip' => ip(), 'porta' => (int) ($_SERVER['REMOTE_PORT'] ?? 0) ?: null, 'acao' => $acao, 'criado_em' => agora()]);
    } catch (Throwable $e) { error_log('[mobiliza] log_acesso: ' . $e->getMessage()); }
}

/* ---------------- limites de envio ---------------- */
function limitar(string $chave, int $max, int $segundos, string $msg = 'Muitas tentativas. Espere um pouco e tente de novo.'): void {
    $agora = time();
    $l = um('SELECT contagem, expira_em FROM limites WHERE chave = ?', [$chave]);
    if (!$l || (int) $l['expira_em'] < $agora) {
        if ($l) q('UPDATE limites SET contagem = 1, expira_em = ? WHERE chave = ?', [$agora + $segundos, $chave]);
        else { try { inserir('limites', ['chave' => $chave, 'contagem' => 1, 'expira_em' => $agora + $segundos]); } catch (Throwable $e) { if (!eh_duplicado($e)) throw $e; } }
        return;
    }
    if ((int) $l['contagem'] >= $max) erro(429, $msg);
    q('UPDATE limites SET contagem = contagem + 1 WHERE chave = ?', [$chave]);
}

/* ---------------- sessão e CSRF ---------------- */
function iniciar_sessao(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('MPSESS');
    session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 30, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 30));
    if (!defined('MP_TESTE')) session_start();
    else if (!isset($_SESSION)) $_SESSION = [];
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
}
function exigir_csrf(): void {
    $dado = $_SERVER['HTTP_X_CSRF'] ?? '';
    if (!is_string($dado) || !hash_equals($_SESSION['csrf'] ?? '', $dado)) erro(403, 'Sessão expirada. Recarregue a página.');
    // Bloqueia envio vindo de outro site
    $origem = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origem !== '') {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        if (parse_url($origem, PHP_URL_HOST) !== explode(':', $host)[0]) erro(403, 'Origem não permitida.');
    }
}

/* ---------------- usuário atual ---------------- */
function usuario(): ?array {
    static $u = false;
    if ($u !== false && !defined('MP_TESTE')) return $u;
    $id = $_SESSION['uid'] ?? null;
    $u = $id ? um('SELECT * FROM usuarios WHERE id = ?', [$id]) : null;
    if ($u && $u['status'] !== 'ativo' && $u['status'] !== 'suspenso') { $_SESSION = []; $u = null; }
    return $u;
}
function exigir_login(): array {
    $u = usuario();
    if (!$u) erro(401, 'Entre com sua conta Google para continuar.');
    return $u;
}
function exigir_ativo(): array {
    $u = exigir_login();
    if ($u['status'] === 'suspenso') erro(403, 'Sua conta está suspensa. Fale com a equipe se achar que foi engano.');
    if (!$u['aceitou_regras_em']) erro(403, 'Antes de publicar, leia e aceite as regras da comunidade.', ['precisa' => 'regras']);
    return $u;
}
function pode_publicar(array $u): void {
    if (cfg('exigir_verificacao_idade') && !$u['idade_verificada'] && !eh_mod($u)) {
        erro(403, 'Para publicar, sua idade precisa ser confirmada pela equipe (exigência do ECA Digital). Peça a verificação no seu perfil.', ['precisa' => 'idade']);
    }
}
function eh_mod(?array $u): bool { return $u && in_array($u['papel'], ['moderador', 'admin'], true); }
function eh_admin(?array $u): bool { return $u && $u['papel'] === 'admin'; }
function exigir_mod(): array { $u = exigir_login(); if (!eh_mod($u)) erro(403, 'Área só para a moderação.'); return $u; }
function exigir_admin(): array { $u = exigir_login(); if (!eh_admin($u)) erro(403, 'Área só para administradores.'); return $u; }

function log_mod(?int $mod, string $acao, string $tipo, int $id, ?string $motivo = null): void {
    inserir('log_moderacao', ['moderador_id' => $mod, 'acao' => $acao, 'alvo_tipo' => $tipo, 'alvo_id' => $id, 'motivo' => $motivo ? mb_substr($motivo, 0, 300) : null, 'criado_em' => agora()]);
}

function publico_usuario(array $u): array {
    return ['id' => (int) $u['id'], 'apelido' => $u['apelido'], 'nome' => $u['nome'], 'foto' => $u['foto_url'], 'papel' => $u['papel'],
            'uf' => $u['uf'], 'cidade' => $u['cidade'], 'bio' => $u['bio']];
}
