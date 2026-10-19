#!/usr/bin/env python3
"""Refresh the "Today's revenue actions" panel on the JDP CRM dashboard (kits/_dash/).

WHY (Steven, 2026-10-19): "whatever revenue producing actions you need me to do add to
https://justdealspromotions.com/kits/_dash/ — this will be the central CRM".

SOURCE   Airtable appCYDBvfvfaLfzyi / ACCOUNTS_V2 tblPvNwroPHjI0OSV / record recf6llLkG4mZOqSr /
         field "Dash Actions" (fldHM0joaNVuYhN9I) — JSON written by the Outbound Ops pipeline every run:
         {generated_at, summary{REPLY,EMAIL,CALL,VENDOR,NOTE}, actions[...]}.
OUTPUT   kits/_dash/actions.enc.json in the jdp-kits-deploy repo (mirrored to the live site).

PRIVACY  The actions carry names, emails and phone numbers, and the deploy repo and the site are public,
         so NOTHING is written in plain text. The payload is encrypted to the dashboard's public key
         (ECDH P-256 + SHA-256 -> AES-256-GCM, fresh ephemeral key every run). The matching private key is
         never stored anywhere: the dashboard page derives it in the browser from the dashboard key that
         events.php already keeps above the web root and only ever emails to Steven
         (d = SHA-256("jdp-dash-actions-p256:" + key)). So this script needs NO secret except the Airtable
         token (to read) and the GitHub token (to push), and anyone who fetches the file gets ciphertext.
         If the events.php key is ever regenerated, re-derive PUB below (see --derive-pub).

TRUNCATION  An Airtable long-text field stops at 100,000 characters. If the pipeline writes more, the
         JSON arrives cut off mid-record. This script recovers every COMPLETE action, records how many
         the summary said there should be, and the page shows a red "feed truncated" banner. The real
         fix belongs in the writer (compact the JSON or split it), not here.

USAGE (two credential sets live on two skills, so the normal routine is two calls):
  RunWithCredentials("JDP Sales Targeting Python", "python3 refresh_actions.py --fetch")   # Airtable -> encrypted stage file
  RunWithCredentials("JDP Kits GitHub Deploy",      "python3 refresh_actions.py --push")    # stage file -> repo
  python3 refresh_actions.py            # does whichever halves its environment has credentials for
  python3 refresh_actions.py --push-if-staged   # what jdp_ship.py runs at the end of every ship (never fails a ship)
  python3 refresh_actions.py --derive-pub <dashkey>   # print a new PUB after a key rotation
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

BASE, TABLE, RECORD, FIELD = "appCYDBvfvfaLfzyi", "tblPvNwroPHjI0OSV", "recf6llLkG4mZOqSr", "fldHM0joaNVuYhN9I"
OWNER, REPO, BRANCH = "steven12h-1994", "jdp-kits-deploy", "main"
REPO_PATH = "kits/_dash/actions.enc.json"
STAGE = os.environ.get("JDP_DASH_STAGE", "/agent/workspace/_dash_stage/actions.enc.json")
STAGE_MAX_AGE_H = 12
# Dashboard public key (not secret). Matches the private key the page derives from the events.php key.
PUB = {"kty": "EC", "crv": "P-256", "x": "tX2z6qLrFdKTC6UxpydMWGUNk1eXnzRTpQz-VLQ76FY",
       "y": "-hePCz-JpfULvFqV4YEKmB_wp083zT1mNHDFjtcsrM0", "kid": "jdp-dash-actions-v1"}
INFO = b"jdp-dash-actions-v1"
KEEP = ["id", "priority", "type", "score", "opens", "today", "company", "contact", "title", "email", "phone",
        "store", "linkedin", "action", "due", "quote", "others", "source", "airtable"]
TYPES = ["REPLY", "EMAIL", "CALL", "VENDOR", "NOTE"]


def _crypto():
    try:
        from cryptography.hazmat.primitives.asymmetric import ec  # noqa
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "--user", "-q", "cryptography"], check=False)
        import site, importlib
        importlib.invalidate_caches()
        p = site.getusersitepackages()
        if p not in sys.path:
            sys.path.append(p)
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    return ec, AESGCM


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def ub64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


# ---------------------------------------------------------------- fetch + parse
def fetch_field():
    tok = (os.environ.get("AIRTABLE_API_KEY") or os.environ.get("AIRTABLE_PAT") or "").strip()
    if not tok:
        raise SystemExit("!! no AIRTABLE_API_KEY in this environment — run --fetch under the 'JDP Sales Targeting Python' skill")
    url = f"https://api.airtable.com/v0/{BASE}/{TABLE}/{RECORD}?returnFieldsByFieldId=true"
    for attempt in range(4):
        try:
            r = urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})
            return json.load(urllib.request.urlopen(r, timeout=30))["fields"].get(FIELD) or ""
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(2 + attempt * 3); continue
            raise SystemExit("!! Airtable read failed: HTTP %s %s" % (e.code, e.read()[:200]))


def parse(raw):
    """Full JSON if it parses; otherwise recover generated_at, summary and every complete action."""
    try:
        d = json.loads(raw)
        return d.get("generated_at"), d.get("summary") or {}, d.get("actions") or [], False
    except ValueError:
        pass
    dec = json.JSONDecoder()
    gen = summ = None
    try:
        i = raw.index('"generated_at"'); i = raw.index(":", i) + 1
        while raw[i] in " \n": i += 1
        gen, _ = dec.raw_decode(raw, i)
    except ValueError:
        pass
    try:
        i = raw.index('"summary"'); i = raw.index(":", i) + 1
        while raw[i] in " \n": i += 1
        summ, _ = dec.raw_decode(raw, i)
    except ValueError:
        summ = {}
    acts = []
    a = raw.find('"actions"')
    if a >= 0:
        i = raw.find("[", a) + 1
        while 0 < i < len(raw):
            while i < len(raw) and raw[i] in " ,\n\r\t":
                i += 1
            if i >= len(raw) or raw[i] == "]":
                break
            try:
                o, i = dec.raw_decode(raw, i)
            except ValueError:
                break
            if isinstance(o, dict):
                acts.append(o)
    return gen, summ or {}, acts, True


def tidy(a):
    o = {k: a[k] for k in KEEP if k in a and a[k] not in (None, "")}
    t = o.get("today")
    o["today"] = t is True or str(t).lower() in ("true", "1", "yes")
    for k in ("priority", "opens"):
        try: o[k] = int(float(o[k]))
        except (KeyError, ValueError, TypeError): o.pop(k, None)
    try: o["score"] = float(o["score"])
    except (KeyError, ValueError, TypeError): o.pop("score", None)
    o["type"] = str(o.get("type", "NOTE")).upper()
    return o


def build_payload(raw):
    gen, summ, acts, cut = parse(raw)
    acts = [tidy(a) for a in acts]
    expected = sum(int(summ.get(t, 0) or 0) for t in summ) if summ else len(acts)
    got = {t: sum(1 for a in acts if a["type"] == t) for t in TYPES}
    return {"generated_at": gen, "refreshed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "summary": summ, "recovered": got, "expected": expected, "count": len(acts),
            "truncated": bool(cut or len(acts) < expected), "source_chars": len(raw), "actions": acts}


# ---------------------------------------------------------------- encrypt
def encrypt(obj):
    ec, AESGCM = _crypto()
    curve = ec.SECP256R1()
    pub = ec.EllipticCurvePublicNumbers(int.from_bytes(ub64(PUB["x"]), "big"),
                                        int.from_bytes(ub64(PUB["y"]), "big"), curve).public_key()
    eph = ec.generate_private_key(curve)
    shared = eph.exchange(ec.ECDH(), pub)
    key = hashlib.sha256(shared + INFO).digest()
    iv = os.urandom(12)
    ct = AESGCM(key).encrypt(iv, json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode(), None)
    en = eph.public_key().public_numbers()
    return {"v": 1, "kid": PUB["kid"], "alg": "ECDH-P256+SHA256/A256GCM",
            "epk": {"x": b64u(en.x.to_bytes(32, "big")), "y": b64u(en.y.to_bytes(32, "big"))},
            "iv": b64u(iv), "ct": b64u(ct)}


def derive_pub(dashkey):
    ec, _ = _crypto()
    d = int.from_bytes(hashlib.sha256(("jdp-dash-actions-p256:" + dashkey).encode()).digest(), "big")
    pn = ec.derive_private_key(d, ec.SECP256R1()).public_key().public_numbers()
    print(json.dumps({"kty": "EC", "crv": "P-256", "x": b64u(pn.x.to_bytes(32, "big")),
                      "y": b64u(pn.y.to_bytes(32, "big")), "kid": PUB["kid"]}))


def do_fetch():
    raw = fetch_field()
    if not raw.strip():
        raise SystemExit("!! Dash Actions field is empty — nothing to publish (left the live panel as it was)")
    p = build_payload(raw)
    env = encrypt(p)
    os.makedirs(os.path.dirname(STAGE), exist_ok=True)
    with open(STAGE, "w") as f:
        json.dump(env, f, separators=(",", ":"))
    print("fetched: generated_at=%s  actions=%d of %d  by type=%s  source=%d chars%s"
          % (p["generated_at"], p["count"], p["expected"], p["recovered"], p["source_chars"],
             "  !! FEED TRUNCATED in Airtable (100k limit) — panel shows a warning" if p["truncated"] else ""))
    print("staged (encrypted): %s  %d bytes" % (STAGE, os.path.getsize(STAGE)))


# ---------------------------------------------------------------- push
def _gh(method, url, body=None):
    tok = os.environ["GITHUB_PAT"].strip()
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json", "User-Agent": "jdp-dash"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b"{}")
        except ValueError: return e.code, {}


def push_api(raw):
    api = f"https://api.github.com/repos/{OWNER}/{REPO}"
    sha = hashlib.sha1(b"blob %d\0" % len(raw) + raw).hexdigest()
    st, cur = _gh("GET", f"{api}/contents/{REPO_PATH}?ref={BRANCH}")
    if st == 200 and cur.get("sha") == sha:
        print("repo already has this exact file — nothing to push"); return True
    if st in (403, 429):
        return None
    for attempt in range(4):
        st, ref = _gh("GET", f"{api}/git/ref/heads/{BRANCH}")
        if st in (403, 429): return None
        st2, com = _gh("GET", f"{api}/git/commits/{ref['object']['sha']}")
        stb, blob = _gh("POST", f"{api}/git/blobs", {"content": base64.b64encode(raw).decode(), "encoding": "base64"})
        if stb in (403, 429): return None
        stt, tree = _gh("POST", f"{api}/git/trees", {"base_tree": com["tree"]["sha"], "tree": [
            {"path": REPO_PATH, "mode": "100644", "type": "blob", "sha": blob["sha"]}]})
        stc, nc = _gh("POST", f"{api}/git/commits", {"message": "dash: refresh revenue actions (encrypted)",
                                                      "tree": tree["sha"], "parents": [ref["object"]["sha"]]})
        stp, _ = _gh("PATCH", f"{api}/git/refs/heads/{BRANCH}", {"sha": nc["sha"]})
        if stp < 300:
            print("pushed %s  commit %s" % (REPO_PATH, nc["sha"][:8])); return True
        if stp in (403, 429): return None
        time.sleep(2 + attempt * 2)            # ref moved under us (another ship) — rebase and retry
    print("!! could not move the branch after 4 tries"); return False


def push_git(raw):
    """Fallback when the GitHub API quota is exhausted: plain git over HTTPS, sparse + blobless."""
    tok = os.environ["GITHUB_PAT"].strip()
    url = f"https://x-access-token:{tok}@github.com/{OWNER}/{REPO}.git"
    d = tempfile.mkdtemp(prefix="dashgit_")
    run = lambda *a: subprocess.run(a, cwd=d, check=True, capture_output=True, text=True)
    try:
        subprocess.run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", "-b", BRANCH, url, d],
                       check=True, capture_output=True, text=True)
        run("git", "sparse-checkout", "set", "kits/_dash")
        with open(os.path.join(d, REPO_PATH), "wb") as f:
            f.write(raw)
        run("git", "add", REPO_PATH)
        if not run("git", "status", "--porcelain").stdout.strip():
            print("git: no change"); return True
        run("git", "-c", "user.name=JDP Dash", "-c", "user.email=dash@justdealspromotions.com",
            "commit", "-m", "dash: refresh revenue actions (encrypted)")
        for attempt in range(3):
            p = subprocess.run(["git", "push", "origin", BRANCH], cwd=d, capture_output=True, text=True)
            if p.returncode == 0:
                print("pushed via git"); return True
            run("git", "pull", "--rebase", "--depth", "1", "origin", BRANCH)
        print("!! git push failed"); return False
    except subprocess.CalledProcessError as e:
        print("!! git fallback failed:", (e.stderr or "")[-300:].replace(tok, "***")); return False


def do_push(required=True):
    if not os.environ.get("GITHUB_PAT"):
        msg = "no GITHUB_PAT here — run --push under the 'JDP Kits GitHub Deploy' skill"
        if required: raise SystemExit("!! " + msg)
        print("dash actions: " + msg); return
    if not os.path.isfile(STAGE):
        msg = "nothing staged — run --fetch first (JDP Sales Targeting Python skill)"
        if required: raise SystemExit("!! " + msg)
        print("dash actions: " + msg); return
    age_h = (time.time() - os.path.getmtime(STAGE)) / 3600
    if not required and age_h > STAGE_MAX_AGE_H:
        print("dash actions: staged file is %.1f h old — skipped; run --fetch then --push" % age_h); return
    raw = open(STAGE, "rb").read()
    json.loads(raw)                           # never push a broken file
    ok = push_api(raw)
    if ok is None:
        print("GitHub API rate-limited — falling back to plain git push")
        ok = push_git(raw)
    if not ok and required:
        sys.exit(1)
    if ok:
        print("live in ~5 min at https://justdealspromotions.com/kits/_dash/ (panel re-reads every 2 min)")


def main():
    a = sys.argv[1:]
    if "--derive-pub" in a:
        derive_pub(a[a.index("--derive-pub") + 1]); return
    if "--fetch" in a:
        do_fetch(); return
    if "--push" in a:
        do_push(True); return
    if "--push-if-staged" in a:
        try: do_push(False)
        except Exception as e: print("dash actions: skipped (%s)" % e)
        return
    did = False
    if os.environ.get("AIRTABLE_API_KEY") or os.environ.get("AIRTABLE_PAT"):
        do_fetch(); did = True
    if os.environ.get("GITHUB_PAT"):
        do_push(True); did = True
    if not did:
        print(__doc__)


if __name__ == "__main__":
    main()
