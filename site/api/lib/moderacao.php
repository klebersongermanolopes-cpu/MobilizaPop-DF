<?php
// Filtro automático de conteúdo. É a primeira barreira, não a única: denúncias e moderação humana completam.
// Resultado: 'ok' (pode publicar), 'revisar' (vai para a fila da moderação) ou 'bloquear' (não é aceito).
// As listas abaixo podem (e devem) ser ajustadas pela equipe com o tempo.
declare(strict_types=1);
if (!defined('MP_API')) { http_response_code(404); exit; }

function normalizar(string $t): string {
    $t = mb_strtolower($t);
    $t = strtr($t, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's']);
    if (class_exists('Normalizer')) $t = Normalizer::normalize($t, Normalizer::FORM_D) ?: $t;
    $t = preg_replace('/\p{Mn}/u', '', $t) ?? $t;            // tira acentos
    $t = preg_replace('/[^a-z\s]/u', ' ', $t) ?? $t;          // m.a.t.a.r → m a t a r
    $t = preg_replace('/(\p{L})\1{2,}/u', '$1', $t) ?? $t;    // matarrrr → matar
    return ' ' . preg_replace('/\s+/', ' ', $t) . ' ';
}

const MOD_BLOQUEAR = [
    'ameaça ou incitação à violência' => [
        '/\b(vou|vamos|vai|tem que|temos que|precisa|bora) (te |la |lo |eles |elas )?(matar|mata|executar|linchar|espancar|esfaquear|enforcar)\b/',
        '/\b(morte aos?|morte as?|matar todos|matar todas|matar esses|matar essas)\b/',
        '/\b(tacar|botar|meter|por) fogo (em|no|na|nos|nas)\b/',
        '/\b(bomba|explosivo|explodir) (no|na|em|o|a)\b/',
        '/\b(atirar|dar tiro|meter bala|passar bala) (em|no|na|nele|nela|neles)\b/',
        '/\b(sequestrar|sequestro de)\b/',
    ],
    'ataque à democracia (atos antidemocráticos)' => [
        '/\bintervencao militar\b/',
        '/\b(fechar|fecha|invadir|invade|invasao do|invasao da) (o )?(stf|supremo|congresso|planalto|senado|camara|tse)\b/',
        '/\bai ?5\b/',
        '/\bgolpe (ja|agora|militar ja)\b/',
        '/\b(sos|socorro) forcas armadas\b/',
    ],
    'induzimento a suicídio ou automutilação' => [
        '/\b(vai|va|pode ir) se matar\b/',
        '/\b(se mata|se mate|comete suicidio|se corta)\b/',
    ],
    'conteúdo sexual envolvendo menores' => [
        '/\b(crianca|criancas|menor|menores|novinha|novinho|novinhas|adolescente|adolescentes|garotinha|garotinho)\b.{0,60}\b(nude|nudes|pelada|pelado|sexo|sexual|porn|porno|safada|gostosa)\b/',
        '/\b(nude|nudes|pelada|pelado|sexo|sexual|porn|porno)\b.{0,60}\b(crianca|criancas|menor|menores|novinha|novinho|adolescente|garotinha|garotinho)\b/',
    ],
];

const MOD_REVISAR = [
    'possível ofensa ou discriminação' => [
        '/\b(macaco|macaca|macacos|crioulo|crioula|viado|viadinho|traveco|sapatao|bicha|retardado|retardada|mongol|aleijado|favelado|nordestino burro|paraiba burro)\b/',
        '/\b(lixo humano|verme|vermes|parasita|parasitas|subumano|escoria)\b/',
    ],
    'possível exposição de dados pessoais' => [
        '/\b(cpf dele|cpf dela|cpf do|cpf da|endereco dele|endereco dela|endereco da casa|ele mora na|ela mora na|ele mora no|ela mora no|placa do carro|telefone dele|telefone dela|zap dele|zap dela)\b/',
    ],
    'parece corrente ou possível desinformação' => [
        '/\b(compartilhe antes que apaguem|antes que apaguem|a midia nao mostra|a globo nao mostra|repasse para todos|urgente repassem|nao deixe de compartilhar)\b/',
    ],
    'xingamento' => [
        '/\b(fdp|filho da puta|vagabundo|vagabunda|arrombado|arrombada|desgracado|desgracada|corno|cuzao|babaca|otario)\b/',
    ],
];

function analisar_texto(?string $texto, array $usuario): array {
    $texto = (string) $texto;
    if ($texto === '') return ['acao' => 'ok', 'motivo' => null];
    $n = normalizar($texto);
    foreach (MOD_BLOQUEAR as $motivo => $regras) {
        foreach ($regras as $r) if (preg_match($r, $n)) return ['acao' => 'bloquear', 'motivo' => $motivo];
    }
    foreach (MOD_REVISAR as $motivo => $regras) {
        foreach ($regras as $r) if (preg_match($r, $n)) return ['acao' => 'revisar', 'motivo' => $motivo];
    }
    // Números que parecem CPF ou telefone (sem ser data): possível exposição de dados
    if (preg_match('/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/', $texto) || preg_match('/\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/', $texto)) {
        return ['acao' => 'revisar', 'motivo' => 'possível exposição de dados pessoais'];
    }
    $confiavel = in_array($usuario['papel'] ?? '', ['confiavel', 'moderador', 'admin'], true);
    // Links de contas novas passam pela moderação (golpe, spam e desinformação costumam vir por link)
    if (!$confiavel && preg_match('#https?://|www\.|\b[a-z0-9-]+\.(com|net|org|br|xyz|info|site|online|ly)(/|\b)#i', $texto)) {
        return ['acao' => 'revisar', 'motivo' => 'contém link (contas novas passam por revisão)'];
    }
    // Texto todo em maiúsculas e longo costuma ser corrente
    $letras = preg_replace('/[^\p{L}]/u', '', $texto) ?? '';
    if (mb_strlen($letras) > 60 && $letras === mb_strtoupper($letras)) {
        return ['acao' => 'revisar', 'motivo' => 'parece corrente ou possível desinformação'];
    }
    return ['acao' => 'ok', 'motivo' => null];
}

// Decide o status inicial de um conteúdo novo (moderação híbrida).
// Texto: publica na hora se passar no filtro. Foto, vídeo, story, reel e evento: vão para aprovação,
// exceto de contas confiáveis/moderação.
function status_inicial(string $tipo, array $analise, array $usuario): array {
    if ($analise['acao'] === 'bloquear') return ['bloquear', $analise['motivo']];
    if ($analise['acao'] === 'revisar') return ['pendente', $analise['motivo']];
    $confiavel = in_array($usuario['papel'], ['confiavel', 'moderador', 'admin'], true);
    if ($tipo === 'texto' || $tipo === 'comentario' || $confiavel) return ['publicado', null];
    return ['pendente', 'mídia e eventos de contas novas passam por aprovação'];
}
