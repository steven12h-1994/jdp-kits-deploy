<?php
/*
 * JDP store funnel events — where do buyers drop off?
 *
 * WHY THIS EXISTS
 * Steven, 2026-09-25: "4 imprint does 1 billion in revenue and we do not!" 4imprint decides with
 * data. Our 583 company stores recorded NOTHING: not how many people opened a store, searched,
 * found nothing, opened a product, added it, reached checkout or sent a request. Every UX decision
 * so far was made by reading code and screenshots. This is the smallest honest instrument: an
 * anonymous count of the steps of the funnel, per store, per day.
 *
 * ENDPOINTS
 *   POST {kit, e, sid, q?, n?, k?}           -> 204   (sendBeacon; the store never waits on it)
 *   GET  ?report=1&days=7[&kit=<slug>]       -> JSON funnel report
 *        Authorization: Bearer <GitHub token>   verified against api.github.com/user: only the
 *        account that owns the deploy repo can read. No new password exists anywhere.
 *
 * PRIVACY
 * No names, no emails, no IP stored. `sid` is a random per-tab id the browser makes up. Search text
 * is kept (it is the single most useful thing to learn) but anything that looks like an email
 * address or a phone number is removed before it is written.
 *
 * STORAGE  <account>/jdp-board-data/_events/<YYYY-MM-DD>.jsonl, above the document root and outside
 * the GitHub->SiteGround mirror, beside the boards this same host already keeps.
 */
declare(strict_types=1);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const EV_OK        = ['view','search','search0','sheet','add','board','checkout','sent','source','aisle'];
const EV_PER_HOUR  = 900;        // per IP; a real buyer sends a few dozen
const REPO_OWNER   = 'steven12h-1994';

function data_root(): string { return dirname(__DIR__, 3) . '/jdp-board-data'; }
function ensure_dir(string $d): bool { return is_dir($d) || (@mkdir($d, 0775, true) && is_dir($d)); }
function slug(?string $s, int $max = 60): string {
    $s = strtolower(trim((string)$s));
    return preg_match('/^[a-z0-9][a-z0-9_\-]{0,' . ($max - 1) . '}$/', $s) ? $s : '';
}
function clean_q(?string $q): string {
    $q = mb_substr(trim((string)$q), 0, 80);
    $q = preg_replace('/\S+@\S+/', '[email]', $q);                  // never keep an address
    $q = preg_replace('/\+?\d[\d\s\-().]{6,}\d/', '[number]', $q);   // or a phone number
    return mb_strtolower(preg_replace('/\s+/', ' ', $q));
}
function rate_ok(): bool {
    $dir = data_root() . '/_rate';
    if (!ensure_dir($dir)) return true;
    $f = $dir . '/ev_' . substr(sha1((string)($_SERVER['REMOTE_ADDR'] ?? '0') . '|ev'), 0, 24) . '.json';
    $now = time(); $hits = [];
    if (is_file($f)) { $d = json_decode((string)@file_get_contents($f), true); if (is_array($d)) $hits = $d; }
    $hits = array_values(array_filter($hits, static fn($t) => is_int($t) && $t > $now - 3600));
    if (count($hits) >= EV_PER_HOUR) return false;
    $hits[] = $now; @file_put_contents($f, json_encode($hits), LOCK_EX);
    return true;
}

/* ---- read: the funnel report, for the repo owner only ---------------------------------------- */
function bearer(): string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$h && function_exists('getallheaders')) { foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'authorization') $h = $v; } }
    return preg_match('/^Bearer\s+(\S+)$/i', trim($h), $m) ? $m[1] : '';
}
function owner_ok(string $tok): bool {
    if ($tok === '') return false;
    $cache = data_root() . '/_rate/auth_' . hash('sha256', $tok) . '.ok';
    if (is_file($cache) && filemtime($cache) > time() - 900) return true;      // 15 minutes
    $ctx = stream_context_create(['http' => ['method' => 'GET', 'timeout' => 8, 'ignore_errors' => true,
        'header' => "Authorization: Bearer $tok\r\nUser-Agent: jdp-events\r\nAccept: application/vnd.github+json\r\n"]]);
    $raw = @file_get_contents('https://api.github.com/user', false, $ctx);
    $u = $raw ? json_decode($raw, true) : null;
    $ok = is_array($u) && strtolower((string)($u['login'] ?? '')) === REPO_OWNER;
    if ($ok) { ensure_dir(dirname($cache)); @touch($cache); }
    return $ok;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    header('Content-Type: application/json; charset=utf-8');
    if (empty($_GET['report'])) { http_response_code(400); echo '{"ok":false}'; exit; }
    if (!owner_ok(bearer())) { http_response_code(403); echo '{"ok":false,"error":"forbidden"}'; exit; }
    $days = max(1, min(90, (int)($_GET['days'] ?? 7)));
    $only = slug($_GET['kit'] ?? '');
    $steps = EV_OK; $tot = array_fill_keys($steps, 0); $sess = []; $kits = []; $q = []; $q0 = []; $prod = []; $byDay = [];
    for ($i = 0; $i < $days; $i++) {
        $day = gmdate('Y-m-d', time() - 86400 * $i);
        $f = data_root() . "/_events/$day.jsonl";
        if (!is_file($f)) continue;
        $fh = @fopen($f, 'r'); if (!$fh) continue;
        while (($line = fgets($fh)) !== false) {
            $r = json_decode($line, true); if (!is_array($r)) continue;
            if ($only && ($r['kit'] ?? '') !== $only) continue;
            $e = $r['e'] ?? ''; if (!isset($tot[$e])) continue;
            $tot[$e]++; $byDay[$day][$e] = ($byDay[$day][$e] ?? 0) + 1;
            $sid = ($r['kit'] ?? '') . '|' . ($r['sid'] ?? '');
            $sess[$sid][$e] = 1;
            $k = $r['kit'] ?? ''; $kits[$k][$e] = ($kits[$k][$e] ?? 0) + 1;
            if ($e === 'search')  { $t = $r['q'] ?? ''; if ($t !== '') $q[$t]  = ($q[$t]  ?? 0) + 1; }
            if ($e === 'search0') { $t = $r['q'] ?? ''; if ($t !== '') $q0[$t] = ($q0[$t] ?? 0) + 1; }
            if (in_array($e, ['sheet', 'add'], true) && !empty($r['k'])) { $prod[$r['k']][$e] = ($prod[$r['k']][$e] ?? 0) + 1; }
        }
        fclose($fh);
    }
    /* The funnel counts SESSIONS that reached each step, so one buyer opening ten products is one. */
    $funnel = array_fill_keys(['view', 'search', 'sheet', 'add', 'checkout', 'sent'], 0);
    foreach ($sess as $s) { foreach ($funnel as $st => $_) { if (!empty($s[$st])) $funnel[$st]++; } }
    arsort($q); arsort($q0);
    uasort($kits, static fn($a, $b) => ($b['view'] ?? 0) <=> ($a['view'] ?? 0));
    uasort($prod, static fn($a, $b) => ($b['add'] ?? 0) <=> ($a['add'] ?? 0) ?: ($b['sheet'] ?? 0) <=> ($a['sheet'] ?? 0));
    echo json_encode(['ok' => true, 'days' => $days, 'kit' => $only ?: null, 'sessions' => count($sess),
        'funnel_sessions' => $funnel, 'events' => $tot, 'by_day' => $byDay,
        'top_searches' => array_slice($q, 0, 40, true), 'zero_result_searches' => array_slice($q0, 0, 40, true),
        'top_products' => array_slice($prod, 0, 30, true), 'kits' => array_slice($kits, 0, 60, true)], JSON_UNESCAPED_SLASHES);
    exit;
}

/* ---- write: one anonymous event --------------------------------------------------------------- */
$raw = file_get_contents('php://input', false, null, 0, 4096) ?: '';
$in = json_decode($raw, true);
if (!is_array($in)) { http_response_code(204); exit; }
$kit = slug($in['kit'] ?? ''); $e = (string)($in['e'] ?? '');
$sid = preg_match('/^[a-z0-9]{8,32}$/', (string)($in['sid'] ?? '')) ? (string)$in['sid'] : '';
if ($kit === '' || $sid === '' || !in_array($e, EV_OK, true) || !rate_ok()) { http_response_code(204); exit; }
$rec = ['t' => time(), 'kit' => $kit, 'e' => $e, 'sid' => $sid];
if (isset($in['q'])) $rec['q'] = clean_q((string)$in['q']);
if (isset($in['n'])) $rec['n'] = max(0, min(100000, (int)$in['n']));
if (isset($in['k'])) { $k = slug((string)$in['k'], 60); if ($k) $rec['k'] = $k; }
$dir = data_root() . '/_events';
if (ensure_dir($dir)) {
    @file_put_contents($dir . '/' . gmdate('Y-m-d') . '.jsonl', json_encode($rec, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
}
http_response_code(204);
