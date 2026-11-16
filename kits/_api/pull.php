<?php
/*
 * JDP instant kit publish -- copy ONE company store from GitHub onto the live site right now.
 *
 * WHY THIS EXISTS (Nov 16 2026, Keurig Dr Pepper Canada shipped as a 404)
 * The GitHub -> SiteGround mirror is a cron that re-copies the WHOLE kits/ tree, alphabetically,
 * about one kit per second, with no change detection. A full pass takes ~27 min (most of the first
 * 11 min is _catalog/img), and passes can be hours apart. A brand-new kit therefore waited 30-120 min
 * depending on where its slug sorts, while the store email went out 4 min after the push.
 * This endpoint publishes one kit in seconds; the mirror's next pass rewrites identical bytes.
 *
 * ENDPOINTS
 *   GET  ?probe=1                                  -> capability check (outbound HTTPS, write access)
 *   GET  ?slug=<slug>                              -> list kits/<slug> via the GitHub API at main, sync
 *   POST {slug, sha, files:[{p:"img/x.png", s:"<blob sha>"}]}
 *                                                  -> sync the given files at commit <sha> (no API calls)
 *   -> {ok, slug, sha, written:[..], same:N, failed:[..]}
 *
 * SAFETY (public endpoint, so it can ONLY ever reproduce what is already in the public repo):
 *  - content is fetched from raw.githubusercontent.com pinned to a commit sha and its git blob sha
 *    is re-computed and must match before anything is written; a caller cannot inject bytes
 *  - writes only under public_html/kits/<slug>/; slug must be a real kit slug (never _app/_catalog/_api)
 *  - path whitelist (no .., no dotfiles, extension whitelist, depth <= 3), file and count caps
 *  - atomic temp+rename writes; never deletes anything
 *  - per-IP rate budget
 */

declare(strict_types=1);
@set_time_limit(150);

const OWNER = 'steven12h-1994';
const REPO  = 'jdp-kits-deploy';
const MAX_FILES   = 400;
const MAX_BYTES   = 12 * 1024 * 1024;
const CALLS_PER_HR = 60;     // per IP
const EXT_OK = ['html','htm','json','png','jpg','jpeg','webp','gif','svg','css','js','txt','ico','avif','mp4','webm'];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out(int $code, array $p): void {
    http_response_code($code);
    echo json_encode($p, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function kits_dir(): string { return dirname(__DIR__); }                       // public_html/kits
function data_dir(): string { return dirname(__DIR__, 3) . '/jdp-board-data/_pull'; }

function rate_ok(): bool {
    $d = data_dir();
    if (!is_dir($d) && !@mkdir($d, 0775, true)) return true;
    $f = $d . '/' . substr(sha1((string)($_SERVER['REMOTE_ADDR'] ?? '0')), 0, 24) . '.json';
    $now = time(); $hits = [];
    $fh = @fopen($f, 'c+');
    if (!$fh) return true;
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $dec = $raw ? json_decode($raw, true) : null;
    if (is_array($dec)) $hits = array_values(array_filter($dec, fn($t) => is_int($t) && $t > $now - 3600));
    $ok = count($hits) < CALLS_PER_HR;
    if ($ok) $hits[] = $now;
    ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($hits));
    flock($fh, LOCK_UN); fclose($fh);
    return $ok;
}

function http_get(string $url, int $timeout = 30): array {
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_USERAGENT => 'jdp-kit-pull/1.0',
            CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json']]);
        $body = curl_exec($c);
        $code = (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE);
        $err = curl_error($c);
        curl_close($c);
        return [$code, $body === false ? '' : (string)$body, $err];
    }
    $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'ignore_errors' => true,
        'header' => "User-Agent: jdp-kit-pull/1.0\r\nAccept: application/vnd.github+json\r\n"]]);
    $body = @file_get_contents($url, false, $ctx);
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $code = (int)$m[1];
    return [$code, $body === false ? '' : (string)$body, $body === false ? 'fopen failed' : ''];
}

function blob_sha(string $bytes): string { return sha1('blob ' . strlen($bytes) . "\0" . $bytes); }

function slug_ok(string $s): bool { return (bool)preg_match('/^[a-z0-9][a-z0-9-]{0,99}$/', $s); }

function path_ok(string $p): bool {
    if ($p === '' || strlen($p) > 200 || strpos($p, '..') !== false) return false;
    if (!preg_match('#^[A-Za-z0-9_][A-Za-z0-9._-]*(/[A-Za-z0-9_][A-Za-z0-9._-]*){0,2}$#', $p)) return false;
    $ext = strtolower(pathinfo($p, PATHINFO_EXTENSION));
    return in_array($ext, EXT_OK, true);
}

/* Walk kits/<slug> on GitHub (GET mode only). Returns [sha, files] or throws. */
function list_remote(string $slug): array {
    [$c, $b] = http_get('https://api.github.com/repos/' . OWNER . '/' . REPO . '/commits/main');
    $j = json_decode($b, true);
    if ($c !== 200 || !isset($j['sha'])) throw new RuntimeException("head lookup HTTP $c");
    $sha = $j['sha'];
    $files = []; $queue = [''];
    while ($queue && count($files) <= MAX_FILES) {
        $rel = array_shift($queue);
        $url = 'https://api.github.com/repos/' . OWNER . '/' . REPO . '/contents/kits/' . $slug . ($rel !== '' ? '/' . $rel : '') . '?ref=' . $sha;
        [$c, $b] = http_get($url);
        if ($c === 404 && $rel === '') throw new RuntimeException('kit not in repo');
        $list = json_decode($b, true);
        if ($c !== 200 || !is_array($list)) throw new RuntimeException("listing HTTP $c");
        foreach ($list as $e) {
            $p = ($rel !== '' ? $rel . '/' : '') . $e['name'];
            if ($e['type'] === 'dir' && substr_count($p, '/') < 2) $queue[] = $p;
            elseif ($e['type'] === 'file') $files[] = ['p' => $p, 's' => $e['sha']];
        }
    }
    return [$sha, $files];
}

function sync_files(string $slug, string $sha, array $files): array {
    $root = kits_dir() . '/' . $slug;
    $written = []; $same = 0; $failed = [];
    // index.html last so a half-published kit never renders against missing images
    usort($files, fn($a, $b) => ((string)$a['p'] === 'index.html') <=> ((string)$b['p'] === 'index.html'));
    foreach ($files as $f) {
        $p = (string)($f['p'] ?? ''); $s = strtolower((string)($f['s'] ?? ''));
        if (!path_ok($p) || !preg_match('/^[0-9a-f]{40}$/', $s)) { $failed[] = [$p, 'rejected path/sha']; continue; }
        $dest = $root . '/' . $p;
        if (is_file($dest)) {
            $cur = @file_get_contents($dest);
            if ($cur !== false && blob_sha($cur) === $s) { $same++; continue; }
        }
        $url = 'https://raw.githubusercontent.com/' . OWNER . '/' . REPO . '/' . $sha . '/kits/' . $slug . '/' . implode('/', array_map('rawurlencode', explode('/', $p)));
        $bytes = ''; $ok = false; $why = '';
        for ($i = 0; $i < 3 && !$ok; $i++) {
            [$c, $bytes, $err] = http_get($url, 60);
            if ($c === 200 && strlen($bytes) <= MAX_BYTES && blob_sha($bytes) === $s) $ok = true;
            else { $why = "HTTP $c" . ($err ? " $err" : '') . ($c === 200 ? ' blob mismatch' : ''); usleep(400000); }
        }
        if (!$ok) { $failed[] = [$p, $why]; continue; }
        $dir = dirname($dest);
        if (!is_dir($dir) && !@mkdir($dir, 0755, true)) { $failed[] = [$p, 'mkdir failed']; continue; }
        $tmp = $dir . '/.pull-' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, $bytes) === false || !@rename($tmp, $dest)) { @unlink($tmp); $failed[] = [$p, 'write failed']; continue; }
        @chmod($dest, 0644);
        $written[] = $p;
    }
    return [$written, $same, $failed];
}

/* ---------------- dispatch ---------------- */

if (isset($_GET['probe'])) {
    [$c, $b, $err] = http_get('https://raw.githubusercontent.com/' . OWNER . '/' . REPO . '/main/README.md', 15);
    out(200, ['ok' => true, 'php' => PHP_VERSION, 'curl' => function_exists('curl_init'),
        'url_fopen' => (bool)ini_get('allow_url_fopen'), 'raw_github' => $c, 'raw_err' => $err,
        'kits_writable' => is_writable(kits_dir()), 'build' => 'pull-r1']);
}

if (!rate_ok()) out(429, ['ok' => false, 'error' => 'rate limit']);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
try {
    if ($method === 'POST') {
        $raw = file_get_contents('php://input', false, null, 0, 262144);
        $in = json_decode((string)$raw, true);
        if (!is_array($in)) out(400, ['ok' => false, 'error' => 'bad json']);
        $slug = strtolower((string)($in['slug'] ?? ''));
        $sha  = strtolower((string)($in['sha'] ?? ''));
        $files = is_array($in['files'] ?? null) ? $in['files'] : [];
        if (!slug_ok($slug)) out(400, ['ok' => false, 'error' => 'bad slug']);
        if (!preg_match('/^[0-9a-f]{40}$/', $sha)) out(400, ['ok' => false, 'error' => 'bad sha']);
        if (!$files || count($files) > MAX_FILES) out(400, ['ok' => false, 'error' => 'bad file list']);
    } else {
        $slug = strtolower((string)($_GET['slug'] ?? ''));
        if (!slug_ok($slug)) out(400, ['ok' => false, 'error' => 'bad slug']);
        [$sha, $files] = list_remote($slug);
    }
    [$written, $same, $failed] = sync_files($slug, $sha, $files);
    $live = is_file(kits_dir() . '/' . $slug . '/index.html');
    out($failed ? 207 : 200, ['ok' => !$failed && $live, 'slug' => $slug, 'sha' => $sha,
        'written' => $written, 'same' => $same, 'failed' => $failed, 'index' => $live]);
} catch (Throwable $e) {
    out(502, ['ok' => false, 'error' => $e->getMessage()]);
}
