<?php
// Recebe fotos e vídeos. Fotos são redesenhadas pelo servidor: isso apaga metadados (inclusive a
// localização GPS gravada pelo celular) e neutraliza arquivos disfarçados de imagem.
declare(strict_types=1);
if (!defined('MP_API')) { http_response_code(404); exit; }

const MIME_IMAGEM = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
const MIME_VIDEO  = ['video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov'];

function arquivos_enviados(string $campo = 'arquivos'): array {
    if (empty($_FILES[$campo])) return [];
    $f = $_FILES[$campo];
    if (!is_array($f['name'])) return [$f];
    $lista = [];
    foreach ($f['name'] as $i => $n) {
        $lista[] = ['name' => $n, 'type' => $f['type'][$i], 'tmp_name' => $f['tmp_name'][$i], 'error' => $f['error'][$i], 'size' => $f['size'][$i]];
    }
    return $lista;
}

function pasta_destino(): array {
    $sub = date('Y/m');
    $pasta = rtrim((string) cfg('pasta_uploads'), '/') . '/' . $sub;
    if (!is_dir($pasta) && !mkdir($pasta, 0755, true) && !is_dir($pasta)) erro(500, 'Não deu para salvar o arquivo no servidor.');
    return [$pasta, $sub];
}

function mover(string $de, string $para): bool {
    return defined('MP_TESTE') ? copy($de, $para) : move_uploaded_file($de, $para);
}

// Processa os arquivos e devolve as linhas prontas para a tabela "midias" (sem post_id).
function receber_midias(array $usuario, string $tipoPost): array {
    $arqs = array_values(array_filter(arquivos_enviados(), fn($a) => ($a['error'] ?? 4) !== UPLOAD_ERR_NO_FILE));
    if (!$arqs) return [];
    $max = in_array($tipoPost, ['video', 'reel'], true) ? 1 : ($tipoPost === 'story' ? 1 : 6);
    if (count($arqs) > $max) erro(422, "Envie no máximo $max arquivo(s) neste tipo de publicação.");

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $saida = [];
    foreach ($arqs as $i => $a) {
        if ($a['error'] === UPLOAD_ERR_INI_SIZE || $a['error'] === UPLOAD_ERR_FORM_SIZE) erro(413, 'Arquivo grande demais para o servidor.');
        if ($a['error'] !== UPLOAD_ERR_OK || !is_file($a['tmp_name'])) erro(400, 'O envio do arquivo falhou. Tente de novo.');
        $mime = $finfo->file($a['tmp_name']) ?: '';
        [$pasta, $sub] = pasta_destino();
        $nome = bin2hex(random_bytes(12));

        if (isset(MIME_IMAGEM[$mime])) {
            if ($a['size'] > cfg('limite_imagem_mb') * 1048576) erro(413, 'Foto acima de ' . cfg('limite_imagem_mb') . ' MB.');
            [$arquivo, $l, $h, $bytes, $mimeFinal] = recodificar_imagem($a['tmp_name'], $mime, "$pasta/$nome");
            $saida[] = ['usuario_id' => $usuario['id'], 'tipo' => 'imagem', 'arquivo' => "$sub/" . basename($arquivo), 'mime' => $mimeFinal,
                        'bytes' => $bytes, 'largura' => $l, 'altura' => $h, 'ordem' => $i, 'criado_em' => agora()];
        } elseif (isset(MIME_VIDEO[$mime])) {
            if ($a['size'] > cfg('limite_video_mb') * 1048576) erro(413, 'Vídeo acima de ' . cfg('limite_video_mb') . ' MB. Corte ou comprima antes de enviar.');
            $destino = "$pasta/$nome." . MIME_VIDEO[$mime];
            if (!mover($a['tmp_name'], $destino)) erro(500, 'Não deu para salvar o vídeo.');
            chmod($destino, 0644);
            $saida[] = ['usuario_id' => $usuario['id'], 'tipo' => 'video', 'arquivo' => "$sub/" . basename($destino), 'mime' => $mime,
                        'bytes' => (int) filesize($destino), 'largura' => null, 'altura' => null, 'ordem' => $i, 'criado_em' => agora()];
        } else {
            erro(415, 'Formato não aceito. Use foto JPG, PNG ou WEBP, ou vídeo MP4, WEBM ou MOV.');
        }
    }
    $temVideo = count(array_filter($saida, fn($m) => $m['tipo'] === 'video')) > 0;
    if (in_array($tipoPost, ['video', 'reel'], true) && !$temVideo) erro(422, 'Este tipo de publicação precisa de um vídeo.');
    if ($tipoPost === 'foto' && $temVideo) erro(422, 'Para vídeo, escolha o tipo "Vídeo" ou "Reel".');
    return $saida;
}

function recodificar_imagem(string $origem, string $mime, string $destinoSemExt): array {
    if (!function_exists('imagecreatefromstring')) erro(500, 'O servidor não tem a biblioteca de imagens (GD). Ative no painel da hospedagem.');
    $info = @getimagesize($origem);
    if (!$info || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 50_000_000) erro(415, 'Imagem inválida ou grande demais.');
    $img = @imagecreatefromstring((string) file_get_contents($origem));
    if (!$img) erro(415, 'Não deu para ler a imagem.');

    // Corrige a rotação de fotos de celular antes de apagar os metadados
    if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
        $exif = @exif_read_data($origem);
        $rot = ['3' => 180, '6' => -90, '8' => 90][(string) ($exif['Orientation'] ?? '')] ?? 0;
        if ($rot) { $r = imagerotate($img, $rot, 0); if ($r) { imagedestroy($img); $img = $r; } }
    }
    $l = imagesx($img); $h = imagesy($img);
    $max = 2048;
    if ($l > $max || $h > $max) {
        $f = $max / max($l, $h);
        $nl = (int) round($l * $f); $nh = (int) round($h * $f);
        $novo = imagecreatetruecolor($nl, $nh);
        imagealphablending($novo, false); imagesavealpha($novo, true);
        imagecopyresampled($novo, $img, 0, 0, 0, 0, $nl, $nh, $l, $h);
        imagedestroy($img); $img = $novo; $l = $nl; $h = $nh;
    }
    if (function_exists('imagewebp')) { $arq = "$destinoSemExt.webp"; $ok = imagewebp($img, $arq, 82); $m = 'image/webp'; }
    else { $arq = "$destinoSemExt.jpg"; $ok = imagejpeg($img, $arq, 85); $m = 'image/jpeg'; }
    imagedestroy($img);
    if (!$ok) erro(500, 'Não deu para salvar a imagem.');
    chmod($arq, 0644);
    return [$arq, $l, $h, (int) filesize($arq), $m];
}

function apagar_arquivos_do_post(int $postId): void {
    foreach (todos('SELECT arquivo FROM midias WHERE post_id = ?', [$postId]) as $m) {
        $caminho = rtrim((string) cfg('pasta_uploads'), '/') . '/' . $m['arquivo'];
        if (is_file($caminho) && str_starts_with(realpath($caminho) ?: '', realpath((string) cfg('pasta_uploads')) ?: '///')) @unlink($caminho);
    }
}

function url_midia(string $arquivo): string { return rtrim((string) cfg('url_uploads'), '/') . '/' . $arquivo; }
