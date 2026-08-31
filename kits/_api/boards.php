<?php
/*
 * JDP live boards — the storage behind a company store's shared board.
 *
 * WHY THIS EXISTS
 * Boards used to live in localStorage, which is per-browser by definition: the same kit showed
 * different boards in a normal window and a private window, nothing survived moving to another
 * computer, and a share link had to carry every product in the URL (they ran past 400 characters
 * and changed every time the board did). A board sent to a six-figure account has to be one live
 * document at one permanent address.
 *
 * ENDPOINTS  (same-origin only; the store is served from the same host)
 *   GET  ?kit=<slug>&b=<board>        -> {ok, board:{name, items, rev, updated, by}}
 *   GET  ?kit=<slug>&list=1           -> {ok, boards:[{b, name, n, updated}]}
 *   POST {kit, b, name, items, by, rev} -> {ok, rev, updated}
 *
 * STORAGE
 * <account>/jdp-board-data/<kit>/<board>.json — ABOVE the document root. Deliberate: it is not
 * web-reachable, and it is outside the GitHub->SiteGround mirror, so a sync with --delete can never
 * wipe customer boards. Storing inside public_html/kits/ would have lost every board on the next
 * cron run.
 *
 * SAFETY
 * Public write endpoint, so: strict slug validation, payload and count caps, per-IP write budget,
 * flock-guarded atomic writes, optimistic-concurrency rev check, and no delete. Contents are product
 * picks -- no payment data, no credentials.
 */

declare(strict_types=1);

const MAX_BODY      = 262144;   // 256 KB
const MAX_ITEMS     = 300;      // styles on one board
const MAX_BOARDS    = 400;      // boards per kit
const MAX_NAME      = 60;
const WRITES_PER_HR = 240;      // per IP, per kit

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out(int $code, array $payload): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function slug(?string $s, int $max = 60): string {
    $s = strtolower(trim((string)$s));
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
    $s = trim($s, '-');
    return substr($s, 0, $max);
}

function data_root(): string {
    // __DIR__ = <docroot>/kits/_api  ->  three levels up is the account dir, above public_html.
    return dirname(__DIR__, 3) . '/jdp-board-data';
}

function kit_dir(string $kit): string { return data_root() . '/' . $kit; }
function board_file(string $kit, string $b): string { return kit_dir($kit) . '/' . $b . '.json'; }

function ensure_dir(string $d): bool {
    if (is_dir($d)) return true;
    return @mkdir($d, 0775, true) && is_dir($d);
}

/* Per-IP, per-kit write budget. A single small file, pruned on read. Not a security boundary --
   it is there so one bad script cannot fill the disk. */
function rate_ok(string $kit): bool {
    $dir = data_root() . '/_rate';
    if (!ensure_dir($dir)) return true;                 // never block a real customer on bookkeeping
    $ip  = (string)($_SERVER['REMOTE_ADDR'] ?? '0');
    $f   = $dir . '/' . substr(sha1($ip . '|' . $kit), 0, 24) . '.json';
    $now = time();
    $hits = [];
    if (is_file($f)) {
        $raw = @file_get_contents($f);
        $dec = $raw ? json_decode($raw, true) : null;
        if (is_array($dec)) $hits = $dec;
    }
    $hits = array_values(array_filter($hits, static fn($t) => is_int($t) && $t > $now - 3600));
    if (count($hits) >= WRITES_PER_HR) return false;
    $hits[] = $now;
    @file_put_contents($f, json_encode($hits), LOCK_EX);
    return true;
}

/* Atomic: write a temp file in the same directory, then rename over the target. A reader never sees
   a half-written board, even if two people save at once. */
function write_atomic(string $path, string $data): bool {
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (@file_put_contents($tmp, $data, LOCK_EX) === false) return false;
    if (!@rename($tmp, $path)) { @unlink($tmp); return false; }
    return true;
}

function read_board(string $kit, string $b): ?array {
    $f = board_file($kit, $b);
    if (!is_file($f)) return null;
    $raw = @file_get_contents($f);
    if ($raw === false) return null;
    $dec = json_decode($raw, true);
    return is_array($dec) ? $dec : null;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$kit    = slug($_GET['kit'] ?? ($_POST['kit'] ?? ''));
if ($kit === '') out(400, ['ok' => false, 'error' => 'kit required']);

/* ---------------------------------- READ ---------------------------------- */
if ($method === 'GET') {
    if (!empty($_GET['list'])) {
        $dir = kit_dir($kit);
        $boards = [];
        if (is_dir($dir)) {
            foreach ((glob($dir . '/*.json') ?: []) as $f) {
                $d = json_decode((string)@file_get_contents($f), true);
                if (!is_array($d)) continue;
                $boards[] = [
                    'b'       => basename($f, '.json'),
                    'name'    => (string)($d['name'] ?? ''),
                    'n'       => is_array($d['items'] ?? null) ? count($d['items']) : 0,
                    'updated' => (int)($d['updated'] ?? 0),
                ];
            }
            usort($boards, static fn($x, $y) => $y['updated'] <=> $x['updated']);
        }
        out(200, ['ok' => true, 'boards' => $boards]);
    }

    $b = slug($_GET['b'] ?? '');
    if ($b === '') out(400, ['ok' => false, 'error' => 'b required']);
    $board = read_board($kit, $b);
    if ($board === null) out(404, ['ok' => false, 'error' => 'no such board']);
    out(200, ['ok' => true, 'board' => $board]);
}

/* ---------------------------------- WRITE --------------------------------- */
if ($method !== 'POST') out(405, ['ok' => false, 'error' => 'method not allowed']);

$raw = file_get_contents('php://input');
if ($raw === false) out(400, ['ok' => false, 'error' => 'no body']);
if (strlen($raw) > MAX_BODY) out(413, ['ok' => false, 'error' => 'board too large']);

$in = json_decode($raw, true);
if (!is_array($in)) out(400, ['ok' => false, 'error' => 'bad json']);

$kit = slug((string)($in['kit'] ?? ''));
if ($kit === '') out(400, ['ok' => false, 'error' => 'kit required']);
if (!rate_ok($kit)) out(429, ['ok' => false, 'error' => 'too many saves, try shortly']);

$name = trim((string)($in['name'] ?? ''));
if ($name === '') $name = 'Board';
$name = mb_substr($name, 0, MAX_NAME);

$b = slug((string)($in['b'] ?? '')) ?: slug($name);
if ($b === '') out(400, ['ok' => false, 'error' => 'board name required']);

$items = $in['items'] ?? null;
if (!is_array($items)) out(400, ['ok' => false, 'error' => 'items required']);
if (count($items) > MAX_ITEMS) out(413, ['ok' => false, 'error' => 'too many styles on one board']);

if (!ensure_dir(kit_dir($kit))) out(500, ['ok' => false, 'error' => 'storage unavailable']);

// Cap boards per kit, but never reject an update to a board that already exists.
$existing = read_board($kit, $b);
if ($existing === null) {
    $count = count(glob(kit_dir($kit) . '/*.json') ?: []);
    if ($count >= MAX_BOARDS) out(507, ['ok' => false, 'error' => 'board limit reached for this store']);
}

/* Optimistic concurrency: if the caller names the revision it edited and the stored board has moved
   on, tell it rather than silently overwriting a colleague's change. A caller that omits rev is
   treated as authoritative (first save, or a deliberate overwrite). */
$curRev = (int)($existing['rev'] ?? 0);
$sentRev = array_key_exists('rev', $in) ? (int)$in['rev'] : null;
if ($sentRev !== null && $existing !== null && $sentRev !== $curRev) {
    out(409, ['ok' => false, 'error' => 'stale', 'rev' => $curRev, 'board' => $existing]);
}

$board = [
    'name'    => $name,
    'items'   => $items,
    'by'      => mb_substr(trim((string)($in['by'] ?? '')), 0, 40),
    'rev'     => $curRev + 1,
    'updated' => time(),
];

if (!write_atomic(board_file($kit, $b), (string)json_encode($board, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE))) {
    out(500, ['ok' => false, 'error' => 'could not save']);
}

out(200, ['ok' => true, 'b' => $b, 'rev' => $board['rev'], 'updated' => $board['updated']]);
