#!/usr/bin/env python3
"""
Harvest every association-football player in Wikidata via the public QLever SPARQL
endpoint (https://qlever.dev/api/wikidata) — full Wikidata mirror, CC0, no API key.

Raw results are cached per step and per page under data/raw/<step>/part_NNNNN.tsv, so a
run is resumable and a single bad query can be re-fetched with `fetch <step> --force`
without re-querying the whole catalogue. `build` assembles data/catalogue.sqlite.

Usage:
  python3 harvest.py all                # fetch every step (skipping cached) + build
  python3 harvest.py fetch <step> [--force]
  python3 harvest.py build
  python3 harvest.py status             # cached row counts vs expected
"""
import gzip
import json
import os
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "data", "raw")
DATA = os.path.join(BASE, "data")
ENDPOINT = "https://qlever.dev/api/wikidata"
UA = "FootballCardsHarvest/1.0 (homelab catalogue; psvanzyl@gmail.com)"
PAGE = 100000          # rows per QLever page
THROTTLE = 1.0         # seconds between queries — be polite to a public research endpoint

PREFIX = """PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
"""

# Every person Wikidata files under "association football player" (Q937857).
FOOT = "?p wdt:P106 wd:Q937857"

LANGS = ("en", "nl", "de", "fr", "es", "pt", "it", "ru", "ar", "fa", "ja", "ko", "zh", "tr",
         "pl", "uk", "sv", "no", "da", "fi", "cs", "ro", "el", "he", "hi", "id", "th", "vi")
LANG_FILTER = "FILTER(lang(?label) IN (" + ", ".join('"%s"' % l for l in LANGS) + "))"

# (order-by keys, query body). The order keys must make the order TOTAL, otherwise
# LIMIT/OFFSET paging can repeat or skip rows at page boundaries.
QUERIES = {
    "occupations": ("?p ?occ", "SELECT ?p ?occ WHERE { ?p wdt:P106 ?occ . VALUES ?occ { wd:Q937857 } }"),
    "labels": ("?p ?label",
               "SELECT ?p ?label WHERE { %s . ?p rdfs:label ?label . %s }" % (FOOT, LANG_FILTER)),
    "instanceof": ("?p ?t", "SELECT ?p ?t WHERE { %s . ?p wdt:P31 ?t . }" % FOOT),
    "dob": ("?p ?dob", "SELECT ?p ?dob WHERE { %s . ?p wdt:P569 ?dob . }" % FOOT),
    "height": ("?p ?h", "SELECT ?p ?h WHERE { %s . ?p wdt:P2048 ?h . }" % FOOT),
    "mass": ("?p ?m", "SELECT ?p ?m WHERE { %s . ?p wdt:P2067 ?m . }" % FOOT),
    "image": ("?p ?img", "SELECT ?p ?img WHERE { %s . ?p wdt:P18 ?img . }" % FOOT),
    "citizenship": ("?p ?c", "SELECT ?p ?c WHERE { %s . ?p wdt:P27 ?c . }" % FOOT),
    "sportcountry": ("?p ?c", "SELECT ?p ?c WHERE { %s . ?p wdt:P1532 ?c . }" % FOOT),
    "birthplace": ("?p ?bp", "SELECT ?p ?bp WHERE { %s . ?p wdt:P19 ?bp . }" % FOOT),
    "position": ("?p ?pos", "SELECT ?p ?pos WHERE { %s . ?p wdt:P413 ?pos . }" % FOOT),
    "gender": ("?p ?g", "SELECT ?p ?g WHERE { %s . ?p wdt:P21 ?g . }" % FOOT),
    "jersey": ("?p ?num", "SELECT ?p ?num WHERE { %s . ?p wdt:P1618 ?num . }" % FOOT),
    # Career stints: start/end and caps/goals are QUALIFIERS on the P54 statement, not
    # properties of the team item. Reading them off the team yields empty dates for
    # every player while the query still looks correct.
    "teams": ("?p ?team ?start ?end ?caps ?goals",
              "SELECT ?p ?team ?start ?end ?caps ?goals WHERE { %s . ?p p:P54 ?st ."
              " ?st ps:P54 ?team ."
              " OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end }"
              " OPTIONAL { ?st pq:P1350 ?caps } OPTIONAL { ?st pq:P1351 ?goals } }" % FOOT),
    "article": ("?p ?article",
                "SELECT ?p ?article WHERE { %s . ?article schema:about ?p ;"
                " schema:isPartOf <https://en.wikipedia.org/> . }" % FOOT),
}

# Steps whose rows must keep their raw TSV literals: labels carry their @lang tag,
# which the build needs to pick the best name per player.
RAW_STEPS = {"labels", "labels_missing"}

# Row counts measured on the source before the first run — used to prove the harvest
# is complete rather than merely non-empty. None = no cheap expected count.
EXPECTED = {
    "occupations": 392576,
    "labels": 3010043,
    "instanceof": 392674,
    "dob": 372467,
    "height": 93759,
    "mass": 34818,
    "image": 69679,
    "citizenship": 374550,
    "sportcountry": 112734,
    "birthplace": 271602,
    "position": 295751,
    "gender": 390697,
    "jersey": 25000,
    "teams": 1113206,
    "article": 221330,
}

META_QUERIES = {
    "teammeta": ("?e ?label ?type ?typeLabel ?country ?countryLabel ?logo ?inception",
                 "OPTIONAL { ?e rdfs:label ?label . FILTER(lang(?label) = \"en\") }"
                 " OPTIONAL { ?e wdt:P31 ?type . OPTIONAL { ?type rdfs:label ?typeLabel ."
                 " FILTER(lang(?typeLabel) = \"en\") } }"
                 " OPTIONAL { ?e wdt:P17 ?country . OPTIONAL { ?country rdfs:label ?countryLabel ."
                 " FILTER(lang(?countryLabel) = \"en\") } }"
                 " OPTIONAL { ?e wdt:P18 ?logo }"
                 " OPTIONAL { ?e wdt:P571 ?inception }"),
    "posmeta": ("?e ?label",
                "OPTIONAL { ?e rdfs:label ?label . FILTER(lang(?label) = \"en\") }"),
    "countrymeta": ("?e ?label ?iso2 ?iso3",
                    "OPTIONAL { ?e rdfs:label ?label . FILTER(lang(?label) = \"en\") }"
                    " OPTIONAL { ?e wdt:P297 ?iso2 } OPTIONAL { ?e wdt:P298 ?iso3 }"),
    "placemeta": ("?e ?label ?country",
                  "OPTIONAL { ?e rdfs:label ?label . FILTER(lang(?label) = \"en\") }"
                  " OPTIONAL { ?e wdt:P17 ?country }"),
}


# --------------------------------------------------------------------------- fetch

def term(tok):
    """Parse one QLever TSV cell into a plain string (or None when unbound)."""
    if not tok:
        return None
    if tok.startswith("<") and tok.endswith(">"):
        return tok[1:-1]
    if tok.startswith('"'):
        out = []
        i = 1
        while i < len(tok):
            ch = tok[i]
            if ch == "\\" and i + 1 < len(tok):
                nxt = tok[i + 1]
                out.append({"t": "\t", "n": "\n", "r": "\r", '"': '"', "\\": "\\"}.get(nxt, nxt))
                i += 2
                continue
            if ch == '"':
                return "".join(out)
            out.append(ch)
            i += 1
        return "".join(out)
    return tok


_LAST = [0.0]


def fetch_raw(query, timeout=1200, tries=6):
    """Return QLever TSV rows as raw cells (literals keep their quotes and @lang tag)."""
    body = urllib.parse.urlencode({"query": PREFIX + query}).encode()
    last = None
    for attempt in range(tries):
        wait = THROTTLE - (time.time() - _LAST[0])
        if wait > 0:
            time.sleep(wait)
        try:
            req = urllib.request.Request(
                ENDPOINT, data=body,
                headers={"User-Agent": UA, "Accept": "text/tab-separated-values"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                text = r.read().decode("utf-8", "replace")
            _LAST[0] = time.time()
            rows = []
            for line in text.split("\n")[1:]:
                if not line.strip():
                    continue
                rows.append(tuple(line.split("\t")))
            return rows
        except Exception as e:  # noqa: BLE001
            last = e
            _LAST[0] = time.time()
            sys.stderr.write("  retry %d/%d after %s\n" % (attempt + 1, tries, e))
            time.sleep([3, 8, 20, 45, 90][min(attempt, 4)])
    raise RuntimeError("query failed: %s" % last)


def fetch(query, timeout=1200, tries=6):
    """Same, but literals are unwrapped to plain values (no quotes, no @lang)."""
    return [tuple(term(c) for c in row) for row in fetch_raw(query, timeout, tries)]


def qid(uri):
    return uri.rsplit("/", 1)[-1] if uri else None


def write_tsv(path, rows):
    with open(path, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write("\t".join("" if c is None else c for c in r) + "\n")


def step_dir(step):
    return os.path.join(RAW, step)


def step_parts(step):
    d = step_dir(step)
    if not os.path.isdir(d):
        return []
    return sorted(os.path.join(d, f) for f in os.listdir(d) if f.startswith("part_"))


def iter_step(step):
    """Yield every cached row of a step, page by page."""
    for path in step_parts(step):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.rstrip("\n")
                if not line:
                    continue
                yield tuple(c or None for c in line.split("\t"))


def iter_raw_lines(step):
    """Yield the raw (still-quoted) lines of a cached step."""
    for path in step_parts(step):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    yield line.rstrip("\n")


def count_step(step):
    n = 0
    for _ in iter_step(step):
        n += 1
    return n


def fetch_step(step, force=False):
    """Page through one step with LIMIT/OFFSET, caching every page to disk."""
    order, query = QUERIES[step]
    d = step_dir(step)
    os.makedirs(d, exist_ok=True)
    if force:
        for p in step_parts(step):
            os.remove(p)
    page = 0
    t0 = time.time()
    total = 0
    while True:
        path = os.path.join(d, "part_%05d.tsv" % page)
        if os.path.exists(path) and not force:
            n = sum(1 for _ in open(path, encoding="utf-8"))
            total += n
            if n < PAGE:
                print("  %-12s cached: %d rows in %d pages" % (step, total, page + 1))
                return total
            page += 1
            continue
        q = "%s ORDER BY %s LIMIT %d OFFSET %d" % (query, order, PAGE, page * PAGE)
        rows = fetch_raw(q) if step in RAW_STEPS else fetch(q)
        write_tsv(path, rows)
        total += len(rows)
        print("  %-12s page %3d: %7d rows  (%5.1fs)" % (step, page, len(rows), time.time() - t0),
              flush=True)
        if len(rows) < PAGE:
            break
        page += 1
    print("  %-12s TOTAL %d rows  %5.1fs" % (step, total, time.time() - t0), flush=True)
    return total


def meta(name, qids, force=False):
    """Fetch metadata for a QID set, chunked 400 at a time with bisect-on-failure."""
    path = os.path.join(RAW, name + ".tsv")
    if os.path.exists(path) and not force and os.path.getsize(path) > 0:
        rows = []
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.rstrip("\n")
                if line:
                    rows.append(tuple(c or None for c in line.split("\t")))
        print("  %-12s cached (%d rows)" % (name, len(rows)))
        return rows
    qids = sorted(qids)
    rows = []
    failed = []

    def run(chunk):
        if not chunk:
            return
        vars_, body = META_QUERIES[name]
        q = "SELECT %s WHERE { VALUES ?e { %s }\n%s }" % (
            vars_, " ".join("wd:%s" % x for x in chunk), body)
        try:
            rows.extend(fetch(q))
        except Exception as e:  # noqa: BLE001
            if len(chunk) > 1:
                mid = len(chunk) // 2
                sys.stderr.write("  %s: chunk of %d failed (%s) — bisecting\n" % (name, len(chunk), e))
                run(chunk[:mid])
                run(chunk[mid:])
            else:
                sys.stderr.write("  %s: giving up on %s (%s)\n" % (name, chunk[0], e))
                failed.append(chunk[0])

    total_chunks = (len(qids) + 399) // 400
    for i in range(0, len(qids), 400):
        before = len(rows)
        run(qids[i:i + 400])
        print("    %s chunk %d/%d (+%d rows)" % (name, i // 400 + 1, total_chunks, len(rows) - before),
              flush=True)
    write_tsv(path, rows)
    if failed:
        print("    %s: %d QIDs unresolved: %s" % (name, len(failed), ", ".join(failed[:10])))
    return rows


def fetch_labels_missing():
    """Second label pass: players with no label in LANGS get *any* label they have.

    A strict language filter would silently drop whole countries (a player whose only
    label is Turkish, Georgian or Azerbaijani). This closes that gap cheaply.
    """
    path = os.path.join(RAW, "labels_missing.tsv")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        print("  labels_missing cached")
        return
    have = set()
    for r in iter_step("labels"):
        if r and r[0]:
            have.add(qid(term(r[0])))
    missing = []
    for r in iter_step("occupations"):
        if r and r[0]:
            q = qid(r[0])
            if q not in have:
                missing.append(q)
    missing = sorted(set(missing))
    print("  players without a label in %d languages: %d" % (len(LANGS), len(missing)), flush=True)
    rows = []
    for i in range(0, len(missing), 400):
        chunk = missing[i:i + 400]
        q = ("SELECT ?p ?label WHERE { VALUES ?p { %s } ?p rdfs:label ?label . }"
             % " ".join("wd:%s" % x for x in chunk))
        try:
            rows.extend(fetch_raw(q))
        except Exception as e:  # noqa: BLE001
            sys.stderr.write("  labels_missing chunk %d failed: %s\n" % (i // 400, e))
        if (i // 400) % 10 == 0:
            print("    labels_missing %d/%d" % (i // 400 + 1, (len(missing) + 399) // 400), flush=True)
    write_tsv(path, rows)
    print("  labels_missing: %d rows" % len(rows), flush=True)


def fetch_team_labels_missing(teams, force=False):
    """Clubs without an English label would ship as a bare QID — give them whatever
    label they do have (small amateur clubs outside the anglophone world)."""
    path = os.path.join(RAW, "teammeta_labels.tsv")
    if os.path.exists(path) and os.path.getsize(path) > 0 and not force:
        print("  teammeta_labels cached")
        return
    have = set()
    for r in meta("teammeta", teams):
        if r and r[0] and r[1]:
            have.add(qid(r[0]))
    missing = sorted(t for t in teams if t not in have)
    print("  teams without an English label: %d" % len(missing), flush=True)
    rows = []
    for i in range(0, len(missing), 400):
        chunk = missing[i:i + 400]
        q = ("SELECT ?e ?label WHERE { VALUES ?e { %s } ?e rdfs:label ?label ."
             ' FILTER(lang(?label) IN ("en","nl","de","fr","es","pt","it","ca","mul")) }'
             % " ".join("wd:%s" % x for x in chunk))
        try:
            rows.extend(fetch(q))
        except Exception as e:  # noqa: BLE001
            sys.stderr.write("  teammeta_labels chunk %d failed: %s\n" % (i // 400, e))
    write_tsv(path, rows)
    print("  teammeta_labels: %d rows" % len(rows), flush=True)


def do_fetch(force=False):
    os.makedirs(RAW, exist_ok=True)
    print("== fetch ==", flush=True)
    for step in QUERIES:
        fetch_step(step, force)
    fetch_labels_missing()

    teams = set()
    for r in iter_step("teams"):
        if len(r) > 1 and r[1]:
            teams.add(qid(r[1]))
    print("  teams: %d" % len(teams), flush=True)
    meta("teammeta", teams, force)
    fetch_team_labels_missing(teams, force)

    pos = set()
    for r in iter_step("position"):
        if len(r) > 1 and r[1]:
            pos.add(qid(r[1]))
    print("  positions: %d" % len(pos), flush=True)
    meta("posmeta", pos, force)

    ctry = set()
    for step in ("citizenship", "sportcountry"):
        for r in iter_step(step):
            if len(r) > 1 and r[1]:
                ctry.add(qid(r[1]))
    for r in meta("teammeta", teams):
        if len(r) > 4 and r[4]:
            ctry.add(qid(r[4]))
    print("  countries: %d" % len(ctry), flush=True)
    meta("countrymeta", ctry, force)

    places = set()
    for r in iter_step("birthplace"):
        if len(r) > 1 and r[1]:
            places.add(qid(r[1]))
    print("  birthplaces: %d" % len(places), flush=True)
    meta("placemeta", places, force)


def do_status():
    print("%-14s %10s %10s" % ("step", "rows", "expected"))
    for step in QUERIES:
        n = count_step(step)
        exp = EXPECTED.get(step)
        flag = ""
        if exp:
            flag = "OK" if n == exp else "MISMATCH (%+d)" % (n - exp)
        print("%-14s %10d %10s %s" % (step, n, exp or "-", flag))
    for extra in ("labels_missing", "teammeta", "posmeta", "countrymeta", "placemeta"):
        p = os.path.join(RAW, extra + ".tsv")
        if os.path.exists(p):
            n = sum(1 for _ in open(p, encoding="utf-8"))
            print("%-14s %10d" % (extra, n))


# --------------------------------------------------------------------------- build

# Football positions: (regex on the raw Wikidata label, canonical name, group).
# Most specific first; generic catch-alls last. Labels that belong to other sports
# (defenseman, goaltender, placekicker, quarterback, pitcher…) are dropped — those
# players hold a second occupation and their P413 points at the wrong sport.
POS_RULES = [
    (r"goalkeeper|\bkeeper\b|\bgoalie\b", "Goalkeeper", "gk"),
    (r"sweeper|libero", "Sweeper", "def"),
    (r"centre[- ]back|center[- ]back|central def|centre half|center half|centerhalf|"
     r"centre-half|stopper", "Centre-back", "def"),
    (r"wing[- ]back", "Wing-back", "def"),
    (r"full[- ]?back|left[- ]back|right[- ]back|left back|right back|outer def", "Full-back", "def"),
    (r"defensive mid|holding mid|destroyer|\bdm\b", "Defensive midfielder", "mid"),
    (r"attacking mid|playmaker|trequartista|enganche|offensive mid|\bam\b", "Attacking midfielder", "mid"),
    (r"central mid|box[- ]to[- ]box|wing half|half[- ]back|centre mid|center mid|midfield general",
     "Central midfielder", "mid"),
    (r"wide mid|left mid|right mid|side mid", "Wide midfielder", "mid"),
    (r"midfield|\bmid\b", "Midfielder", "mid"),
    (r"winger|wing forward|outside forward|left wing|right wing|\bwing\b", "Winger", "fwd"),
    (r"inside forward|second striker|withdrawn striker|shadow striker|trequartista", "Inside forward", "fwd"),
    (r"centre[- ]forward|center[- ]forward|centre forward|striker|centre forward|\bst\b",
     "Striker", "fwd"),
    (r"attacker|attacking player|offensive player", "Attacker", "fwd"),
    (r"^forward|forward$|\bcf\b", "Forward", "fwd"),
    (r"utility", "Utility player", None),
    (r"defender|defence|defense", "Defender", "def"),
]

GROUP_LABEL = {"gk": "Goalkeeper", "def": "Defender", "mid": "Midfielder", "fwd": "Forward"}
GROUP_ORDER = ["gk", "def", "mid", "fwd"]

# --- primary position -----------------------------------------------------
# Wikidata returns a player's P413 statements in arbitrary order, so taking the
# first one classified Messi and Ronaldo as midfielders. Instead a player is
# described by the most advanced role they are credited with: a player who has
# kept goal is a goalkeeper, otherwise the most attacking role wins (a winger
# who can also play in midfield is a forward). Within a group the more specific
# role beats the generic one ("Striker" over "Forward").
GROUP_PRIORITY = ["gk", "fwd", "mid", "def"]
POS_SPECIFICITY = {
    "gk": ["Goalkeeper"],
    "fwd": ["Striker", "Inside forward", "Winger", "Attacker", "Forward"],
    "mid": ["Attacking midfielder", "Central midfielder", "Wide midfielder",
            "Defensive midfielder", "Midfielder"],
    "def": ["Centre-back", "Full-back", "Wing-back", "Sweeper", "Defender"],
}
CANON_GROUP = {canon: group for _, canon, group in POS_RULES}

# Sanity ceiling for a single career stint. Wikidata carries a few absurdities
# (a "575,656,765 appearances" typo); anything past a plausible career total is
# recorded as unrecorded rather than shipped as fact.
MAX_STINT_APPS = 1500
import time as _time
NOW_YEAR = _time.gmtime().tm_year


def position_rank(name):
    group = CANON_GROUP.get(name)
    if group not in GROUP_PRIORITY:
        return (99, 99)
    specific = POS_SPECIFICITY[group]
    return (GROUP_PRIORITY.index(group), specific.index(name) if name in specific else 99)


def primary_position(pos):
    if not pos:
        return None
    return min(pos, key=lambda n: (position_rank(n), n))


# --- career rows ----------------------------------------------------------
# Wikidata's club history needs cleaning before it can be added up.
MAX_APPS_PER_SEASON = 70
MAX_GOALS_PER_SEASON = 100


def _min2(a, b):
    vals = [x for x in (a, b) if x is not None]
    return min(vals) if vals else None


def _max2(a, b):
    vals = [x for x in (a, b) if x is not None]
    return max(vals) if vals else None


def merge_spells(rows):
    """Fold overlapping records of the same club into one spell.

    Wikidata often carries a spell more than once: Pelé's Santos years exist as both
    1956-1974 and 1957-1974, so adding the rows up doubled his career. Overlapping
    records for one club are merged (widest dates, largest tallies); records that do
    not overlap stay apart, because a player who returns to an old club really did
    have two spells there.
    """
    by_team = {}
    for r in rows:
        by_team.setdefault(r[0], []).append(r)
    out = []
    for tq, rs in by_team.items():
        rs.sort(key=lambda r: (r[1] or 9999, r[2] or 9999))
        cur = None
        for row in rs:
            if cur is None:
                cur = list(row)
                continue
            if cur[2] is None or (row[1] is not None and row[1] <= cur[2]):
                cur[1] = _min2(cur[1], row[1])
                cur[2] = None if (cur[2] is None or row[2] is None) else max(cur[2], row[2])
                cur[3] = _max2(cur[3], row[3])
                cur[4] = _max2(cur[4], row[4])
            else:
                out.append(tuple(cur))
                cur = list(row)
        if cur is not None:
            out.append(tuple(cur))
    return out


def plausible_spell(row):
    """Blank a tally that cannot fit inside the spell's length.

    Editors copy qualifiers between statements, so Coutinho's Santos figures (457 apps,
    370 goals) reappear on every later club he joined, and 457 matches do not fit in
    one season at Vitória. A number that cannot be true is recorded as unknown rather
    than published as fact.
    """
    tq, st, en, ap, gl = row
    if st is None:
        return row
    seasons = max(1, (en or st) - st + 1)
    if ap is not None and ap > MAX_APPS_PER_SEASON * seasons:
        ap = None
    if gl is not None and gl > MAX_GOALS_PER_SEASON * seasons:
        gl = None
    return (tq, st, en, ap, gl)

# Items that are not real people: fictional players (Captain Tsubasa and friends) sit in
# the same occupation class and would otherwise ship as cards.
FICTIONAL = {
    "Q95074",     # fictional character
    "Q15711870",  # fictional human
    "Q15632617",  # fictional human (alt)
    "Q20086263",  # fictional association football player
    "Q3017876",   # character
    "Q22989102",  # fictional character (alt)
}

_DOT = "\u30fb"
_LEAD_PAREN = re.compile(r"^\([^)]*\)\s*")
_TRAIL_PAREN = re.compile(r"\s*\([^)]*\)\s*$")
_QUOTES = "'\"\u2018\u2019\u201c\u201d"


def clean_name(raw):
    if not raw:
        return ""
    n = raw.replace(_DOT, " ")
    for a, b in (("\u2019", "'"), ("\u2018", "'"), ("\u201c", '"'), ("\u201d", '"'),
                 ("\u00a0", " ")):
        n = n.replace(a, b)
    n = re.sub(r"\s+", " ", n).strip()
    n = _LEAD_PAREN.sub("", n)
    n = _TRAIL_PAREN.sub("", n)
    while n and n[0] in _QUOTES:
        n = n[1:].strip()
    while n and n[-1] in _QUOTES:
        n = n[:-1].strip()
    return re.sub(r"\s+", " ", n).strip()


def is_junk_name(n):
    """True only for labels with no name in them at all. Initial-style labels
    ("A. Allen", "J. P. R. Williams") are real players and are kept."""
    return not any(ch.isalpha() for ch in n)


HASH_RE = re.compile(r"^[0-9a-f]{16,}$", re.I)
FILE_RE = re.compile(r"\.(jpe?g|png|gif|svg|tiff?|webp|pdf|webm|ogv|ogg|mp4|djvu)$", re.I)


def clean_label(v):
    if not isinstance(v, str):
        return None
    s = v.strip()
    if not s or len(s) > 90:
        return None
    if HASH_RE.match(s) or FILE_RE.search(s):
        return None
    return s


def clean_iso(v):
    s = str(v or "").strip()
    return s.upper() if re.fullmatch(r"[A-Za-z]{2,3}", s) else None


def flag_emoji(cc):
    if not cc or len(cc) != 2 or not cc.isalpha():
        return None
    return "".join(chr(0x1F1E6 + ord(c.upper()) - 65) for c in cc)


def year_of(iso):
    if not iso or len(iso) < 4 or not iso[:4].isdigit():
        return None
    return int(iso[:4])


def iso_date(v):
    if not v:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", v)
    return "%s-%s-%s" % m.groups() if m else None


def num_of(v):
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def canon_position(label):
    if not label:
        return None, None
    l = label.lower().strip()
    for rx, canon, group in POS_RULES:
        if re.search(rx, l):
            return canon, group
    return None, None


def norm_name(s):
    import unicodedata
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    return re.sub(r"[^0-9a-z]+", " ", s).strip()


NAT_RE = re.compile(r"^(.*?)\s+national\s+(.*?)football team$", re.I)
NAT_W_RE = re.compile(r"^(.*?)\s+(?:women's|womens|female)\s+national\s+(.*?)football team$", re.I)
NAT_U_RE = re.compile(r"^(.*?)\s+national\s+(under[- ]?\d+|[A-Z])\s+(?:football )?team$", re.I)
NAT_AM_RE = re.compile(r"^(.*?)\s+national\s+(amateur|B|olympic)\s+(?:football )?team$", re.I)


def classify_team(name, types_blob):
    """Return (display_name, national: bool, kind: 'club'|'national'|'national-w'|'national-youth')."""
    nm = name or ""
    m = NAT_W_RE.match(nm)
    if m:
        return "%s (women)" % m.group(1).strip(), True, "national-w"
    m = NAT_RE.match(nm)
    if m:
        return m.group(1).strip(), True, "national"
    m = NAT_U_RE.match(nm)
    if m:
        return "%s %s" % (m.group(1).strip(), m.group(2).replace(" ", "").upper().replace("UNDER", "U")
                          .replace("-", "").replace("U", "U")), True, "national-youth"
    m = NAT_AM_RE.match(nm)
    if m:
        return "%s %s" % (m.group(1).strip(), m.group(2).upper()), True, "national-youth"
    nat = bool(re.search(r"national .*football team|national football team", nm, re.I))
    return nm, nat, "national" if nat else "club"


def build_sqlite(out, players, stints, teams, countries, positions, stats):
    tmp = out + ".tmp"
    if os.path.exists(tmp):
        os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.executescript("""
        PRAGMA journal_mode=OFF;
        PRAGMA synchronous=OFF;
        PRAGMA temp_store=MEMORY;
        CREATE TABLE players(
          id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL,
          grp TEXT NOT NULL, pos TEXT, pos_json TEXT,
          dob TEXT, birth_year INT, gender TEXT,
          country_q TEXT, country_iso TEXT, country_name TEXT, country_extra TEXT,
          height_cm INT, weight_kg INT, img TEXT, birthplace TEXT, num INT, wiki TEXT,
          is_open INT NOT NULL DEFAULT 0, cur_team TEXT, nat_team TEXT,
          team_count INT NOT NULL DEFAULT 0, stints INT NOT NULL DEFAULT 0,
          apps INT, goals INT, nat_caps INT, nat_goals INT,
          first_year INT, last_year INT
        );
        CREATE TABLE stints(
          pid TEXT NOT NULL, team TEXT NOT NULL, start INT, end INT,
          apps INT, goals INT, nat INT NOT NULL DEFAULT 0
        );
        CREATE TABLE teams(
          q TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL,
          country_q TEXT, country_name TEXT, country_iso TEXT,
          national INT NOT NULL DEFAULT 0, kind TEXT, logo TEXT, inception INT,
          players INT NOT NULL DEFAULT 0, apps INT, goals INT
        );
        CREATE TABLE countries(
          q TEXT PRIMARY KEY, name TEXT, iso2 TEXT, iso3 TEXT, players INT NOT NULL DEFAULT 0
        );
        CREATE TABLE positions(
          name TEXT PRIMARY KEY, grp TEXT, players INT NOT NULL DEFAULT 0
        );
    """)
    db.executemany(
        "INSERT INTO players VALUES (%s)" % ",".join("?" * 30),
        [[p.get(k) for k in ("id", "name", "name_norm", "grp", "pos", "pos_json", "dob",
                             "birth_year", "gender", "country_q", "country_iso", "country_name",
                             "country_extra", "height_cm", "weight_kg", "img", "birthplace",
                             "num", "wiki", "is_open", "cur_team", "nat_team", "team_count",
                             "stints", "apps", "goals", "nat_caps", "nat_goals", "first_year",
                             "last_year")] for p in players])
    db.executemany("INSERT INTO stints VALUES (?,?,?,?,?,?,?)",
                   [[s["pid"], s["team"], s["start"], s["end"], s["apps"], s["goals"], s["nat"]]
                    for s in stints])
    db.executemany("INSERT INTO teams VALUES (%s)" % ",".join("?" * 13),
                   [[t.get(k) for k in ("q", "name", "name_norm", "country_q", "country_name",
                                        "country_iso", "national", "kind", "logo", "inception",
                                        "players", "apps", "goals")] for t in teams])
    db.executemany("INSERT INTO countries VALUES (?,?,?,?,?)",
                   [[c["q"], c["name"], c["iso2"], c["iso3"], c["players"]] for c in countries])
    db.executemany("INSERT INTO positions VALUES (?,?,?)",
                   [[p["name"], p["grp"], p["players"]] for p in positions])
    db.executescript("""
        CREATE INDEX idx_players_name ON players(name_norm);
        CREATE INDEX idx_players_grp ON players(grp);
        CREATE INDEX idx_players_country ON players(country_iso);
        CREATE INDEX idx_players_birth ON players(birth_year);
        CREATE INDEX idx_players_height ON players(height_cm);
        CREATE INDEX idx_players_mass ON players(weight_kg);
        CREATE INDEX idx_players_last ON players(last_year);
        CREATE INDEX idx_players_open ON players(is_open);
        CREATE INDEX idx_players_gender ON players(gender);
        CREATE INDEX idx_players_cur ON players(cur_team);
        CREATE INDEX idx_players_nat ON players(nat_team);
        CREATE INDEX idx_stints_pid ON stints(pid);
        CREATE INDEX idx_stints_team ON stints(team);
        CREATE INDEX idx_teams_name ON teams(name_norm);
        CREATE INDEX idx_teams_kind ON teams(kind);
        CREATE INDEX idx_teams_players ON teams(players);
        CREATE VIRTUAL TABLE player_fts USING fts5(
          name, content='players', content_rowid='rowid',
          tokenize="unicode61 remove_diacritics 2");
        INSERT INTO player_fts(rowid, name) SELECT rowid, name FROM players;
    """)
    db.commit()
    db.execute("PRAGMA optimize")
    db.commit()
    db.close()
    if os.path.exists(out):
        os.remove(out)
    os.rename(tmp, out)


def do_build():
    print("== build ==", flush=True)
    players = set()
    for r in iter_step("occupations"):
        if r and r[0]:
            players.add(qid(r[0]))
    print("  players: %d" % len(players), flush=True)

    names = defaultdict(dict)
    label_sources = list(iter_raw_lines("labels"))
    p = os.path.join(RAW, "labels_missing.tsv")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as fh:
            label_sources.extend(l for l in fh if l.strip())
    for line in label_sources:
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 2 or not parts[0] or not parts[1]:
            continue
        pid = qid(term(parts[0]))
        m = re.search(r'"@([a-z-]+)$', parts[1])
        lang = m.group(1) if m else "en"
        val = parts[1]
        if val.startswith('"'):
            end = val.rfind('"')
            val = val[1:end] if end > 0 else val[1:]
        names[pid][lang] = val

    def name_of(pid):
        d = names.get(pid)
        if not d:
            return None
        for l in ("en", "nl", "de", "fr", "es", "pt", "it"):
            if l in d:
                return d[l]
        return sorted(d.values(), key=len)[0]

    fictional = set()
    for r in iter_step("instanceof"):
        if len(r) > 1 and r[0] and r[1]:
            if qid(r[1]) in FICTIONAL:
                fictional.add(qid(r[0]))
    print("  fictional items: %d" % len(fictional), flush=True)

    countries = {}
    for r in meta("countrymeta", set()):
        if not r or not r[0]:
            continue
        q = qid(r[0])
        rec = countries.setdefault(q, {"q": q, "name": clean_label(r[1]), "iso2": None, "iso3": None,
                                       "players": 0})
        if len(r) > 2 and r[2]:
            rec["iso2"] = clean_iso(r[2])
        if len(r) > 3 and r[3]:
            rec["iso3"] = clean_iso(r[3])

    positions = {}
    for r in meta("posmeta", set()):
        if not r or not r[0]:
            continue
        q = qid(r[0])
        lbl = r[1] or q
        canon, group = canon_position(lbl)
        positions.setdefault(q, {"q": q, "name": lbl, "canon": canon, "group": group})

    places = {}
    for r in meta("placemeta", set()):
        if not r or not r[0]:
            continue
        q = qid(r[0])
        rec = places.setdefault(q, {"name": clean_label(r[1]), "country": None})
        if len(r) > 2 and r[2]:
            rec["country"] = qid(r[2])

    teams = {}
    for r in meta("teammeta", set()):
        if not r or not r[0]:
            continue
        q = qid(r[0])
        rec = teams.setdefault(q, {"q": q, "name": r[1] or q, "types": [], "country": None,
                                   "countryName": None, "logo": None, "inception": None,
                                   "national": False, "kind": "club", "players": 0,
                                   "apps": 0, "goals": 0})
        if len(r) > 2 and r[2]:
            rec["types"].append(r[3] or "")
        if len(r) > 4 and r[4]:
            rec["country"] = qid(r[4])
            rec["countryName"] = clean_label(r[5])
        if len(r) > 6 and r[6]:
            rec["logo"] = r[6]
        if len(r) > 7 and r[7]:
            rec["inception"] = year_of(r[7])
    for rec in teams.values():
        disp, nat, kind = classify_team(rec["name"], " ".join(rec["types"]))
        rec["name"] = disp
        rec["national"] = nat
        rec["kind"] = kind
    # Fill in names for clubs that had no English label.
    extra_labels = os.path.join(RAW, "teammeta_labels.tsv")
    if os.path.exists(extra_labels):
        with open(extra_labels, encoding="utf-8") as fh:
            for line in fh:
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 2 or not parts[0] or not parts[1]:
                    continue
                q = qid(parts[0])
                if q in teams and (not teams[q]["name"] or teams[q]["name"] == q):
                    lbl = clean_label(parts[1])
                    if lbl:
                        disp, nat, kind = classify_team(lbl, " ".join(teams[q]["types"]))
                        teams[q].update(name=disp, national=nat, kind=kind)

    by = defaultdict(lambda: defaultdict(list))
    for step in ("dob", "height", "mass", "image", "citizenship", "sportcountry", "birthplace",
                 "position", "gender", "jersey", "article"):
        for r in iter_step(step):
            if r and r[0]:
                by[step][qid(r[0])].append(r[1:])

    # Career stints, with the caps/goals qualifiers and the team's national flag.
    stints_by_player = defaultdict(list)
    n_stint_rows = 0
    for r in iter_step("teams"):
        if len(r) < 2 or not r[0] or not r[1]:
            continue
        n_stint_rows += 1
        pid = qid(r[0])
        tq = qid(r[1])
        stints_by_player[pid].append((
            tq,
            year_of(r[2]) if len(r) > 2 and r[2] else None,
            year_of(r[3]) if len(r) > 3 and r[3] else None,
            int(num_of(r[4])) if len(r) > 4 and num_of(r[4]) is not None else None,
            int(num_of(r[5])) if len(r) > 5 and num_of(r[5]) is not None else None,
        ))
    print("  stint rows: %d" % n_stint_rows, flush=True)

    out_players = []
    stints = []
    team_players = defaultdict(int)
    team_apps = defaultdict(int)
    team_goals = defaultdict(int)
    pos_count = defaultdict(int)
    ctry_count = defaultdict(int)
    dropped_fictional = 0
    dropped_nameless = 0

    for pid in players:
        if pid in fictional:
            dropped_fictional += 1
            continue
        nm = clean_name(name_of(pid) or "")
        if is_junk_name(nm):
            dropped_nameless += 1
            continue

        rec = {"id": pid, "name": nm, "name_norm": norm_name(nm)}

        pos, groups = [], []
        for x in by["position"].get(pid, []):
            if not x or not x[0]:
                continue
            p = positions.get(qid(x[0]))
            if not p or not p["canon"]:
                continue
            if p["canon"] not in pos:
                pos.append(p["canon"])
            if p["group"]:
                groups.append(p["group"])
        rec["pos"] = primary_position(pos)
        rec["pos_json"] = json.dumps(pos, ensure_ascii=False) if pos else None
        rec["grp"] = CANON_GROUP.get(rec["pos"]) or "unknown"
        for p in pos:
            pos_count[p] += 1

        d = by["dob"].get(pid)
        rec["dob"] = iso_date(d[0][0]) if d else None
        rec["birth_year"] = year_of(rec["dob"])
        # Wikidata holds a few impossible birth dates (year 1, year 2100, and a batch
        # of children dated years into the future). A card that says "born 2026" reads
        # as a bug, so an implausible year is recorded as unknown.
        if rec["birth_year"] is not None and not (1850 <= rec["birth_year"] <= NOW_YEAR - 5):
            rec["birth_year"] = None
        g = by["gender"].get(pid)
        rec["gender"] = {"Q6581097": "m", "Q6581072": "f"}.get(qid(g[0][0])) if g else None

        ctz = [qid(x[0]) for x in by["citizenship"].get(pid, []) if x and x[0]]
        cfs = [qid(x[0]) for x in by["sportcountry"].get(pid, []) if x and x[0]]
        primary = None
        for cand in (cfs + ctz):
            if countries.get(cand, {}).get("iso2"):
                primary = cand
                break
        if not primary and (cfs or ctz):
            primary = (cfs + ctz)[0]
        rec["country_q"] = rec["country_iso"] = rec["country_name"] = None
        if primary:
            rec["country_q"] = primary
            rec["country_iso"] = clean_iso(countries.get(primary, {}).get("iso2"))
            rec["country_name"] = clean_label(countries.get(primary, {}).get("name"))
        extra = []
        for x in ctz[1:]:
            c = countries.get(x)
            if c and c.get("iso2"):
                extra.append([c["iso2"], c.get("name")])
        rec["country_extra"] = json.dumps(extra, ensure_ascii=False) if extra else None
        if rec["country_iso"]:
            ctry_count[rec["country_iso"]] += 1

        h = by["height"].get(pid)
        rec["height_cm"] = None
        if h:
            v = num_of(h[0][0])
            if v:
                # Wikidata stores height in metres (1.85) and centimetres (185).
                if 1.2 < v < 2.6:
                    v *= 100
                if 120 < v < 260:
                    rec["height_cm"] = round(v)
        w = by["mass"].get(pid)
        rec["weight_kg"] = None
        if w:
            v = num_of(w[0][0])
            if v:
                # A few items record mass in pounds; nothing human weighs 200+ kg.
                if 200 < v < 400:
                    v *= 0.45359237
                if 40 < v < 200:
                    rec["weight_kg"] = round(v)

        img = by["image"].get(pid)
        rec["img"] = None
        if img:
            u = img[0][0].replace("http://", "https://", 1)
            rec["img"] = u + ("&" if "?" in u else "?") + "width=420"

        bp = by["birthplace"].get(pid)
        rec["birthplace"] = places.get(qid(bp[0][0]), {}).get("name") if bp else None

        num = by["jersey"].get(pid)
        rec["num"] = None
        if num and num[0][0]:
            v = num_of(num[0][0])
            if v and 0 < v < 100:
                rec["num"] = int(v)

        art = by["article"].get(pid)
        rec["wiki"] = art[0][0] if art and art[0][0] else None

        career = []
        seen = set()
        for c in stints_by_player.get(pid, []):
            tq = c[0]
            if tq not in teams:
                continue
            key = (tq, c[1], c[2], c[3], c[4])
            if key in seen:
                continue
            seen.add(key)
            career.append(c)
        # Clean the career rows before they are sorted and summed: drop impossible
        # appearance/goal totals, treat a stint ending in the future as still open,
        # and ignore a start year that cannot be real.
        cleaned = []
        for c in career:
            tq, st, en, ap, gl = c
            if ap is not None and not (0 <= ap <= MAX_STINT_APPS):
                ap = None
            if gl is not None and not (0 <= gl <= MAX_STINT_APPS):
                gl = None
            if en is not None and en > NOW_YEAR:
                en = None
            if st is not None and not (1850 <= st <= NOW_YEAR):
                st = None
            cleaned.append((tq, st, en, ap, gl))
        career = [plausible_spell(c) for c in merge_spells(cleaned)]
        career.sort(key=lambda c: (c[1] or 9999, c[2] or 9999, teams[c[0]]["name"]))
        rec["stints"] = len(career)
        rec["team_count"] = len({c[0] for c in career})
        rec["first_year"] = min([c[1] for c in career if c[1]], default=None)
        rec["last_year"] = max([c[2] or c[1] for c in career if (c[2] or c[1])], default=None)
        rec["is_open"] = 1 if (any(c[2] is None for c in career)
                               and (rec["birth_year"] is None or rec["birth_year"] >= 1985)) else 0
        rec["cur_team"] = rec["nat_team"] = None
        if career:
            open_teams = [c for c in career if c[2] is None]
            cur = max(open_teams, key=lambda c: (c[1] or 0)) if open_teams else career[-1]
            rec["cur_team"] = cur[0]
            nats = [c for c in career if teams[c[0]]["national"]]
            if nats:
                rec["nat_team"] = max(nats, key=lambda c: (c[2] or 9999, c[1] or 0))[0]
        apps = [c[3] for c in career if c[3] is not None]
        goals = [c[4] for c in career if c[4] is not None]
        rec["apps"] = sum(apps) if apps else None
        rec["goals"] = sum(goals) if goals else None
        nat_apps = [c[3] for c in career if c[3] is not None and teams[c[0]]["national"]]
        nat_goals = [c[4] for c in career if c[4] is not None and teams[c[0]]["national"]]
        rec["nat_caps"] = sum(nat_apps) if nat_apps else None
        rec["nat_goals"] = sum(nat_goals) if nat_goals else None
        # Reference year for "age": the catalogue's own build year, so ages stay stable
        # between deploys instead of drifting with the visitor's clock.
        for c in career:
            team_players[c[0]] += 1
            team_apps[c[0]] += c[3] or 0
            team_goals[c[0]] += c[4] or 0
            stints.append({"pid": pid, "team": c[0], "start": c[1], "end": c[2],
                           "apps": c[3], "goals": c[4], "nat": 1 if teams[c[0]]["national"] else 0})
        out_players.append(rec)

    out_players.sort(key=lambda r: r["name_norm"] or r["name"].lower())

    used_teams = []
    for q, t in teams.items():
        if not team_players.get(q):
            continue
        t["players"] = team_players[q]
        t["apps"] = team_apps[q] or None
        t["goals"] = team_goals[q] or None
        t["name_norm"] = norm_name(t["name"])
        t["country_iso"] = clean_iso(countries.get(t["country"], {}).get("iso2"))
        used_teams.append(t)
    used_teams.sort(key=lambda t: (-t["players"], t["name"]))

    used_countries = []
    for c in countries.values():
        if not ctry_count.get(c["iso2"]):
            continue
        c["players"] = ctry_count[c["iso2"]]
        used_countries.append(c)
    used_countries.sort(key=lambda c: -c["players"])

    used_positions = sorted(
        [{"name": k, "grp": None, "players": v} for k, v in pos_count.items()],
        key=lambda p: -p["players"])
    canon_map = {c: g for _, c, g in POS_RULES}
    for p in used_positions:
        p["grp"] = canon_map.get(p["name"])

    stats = {
        "players": len(out_players),
        "teams": len(used_teams),
        "clubs": sum(1 for t in used_teams if t["kind"] == "club"),
        "nationalTeams": sum(1 for t in used_teams if t["national"]),
        "countries": len(used_countries),
        "positions": len(used_positions),
        "women": sum(1 for p in out_players if p["gender"] == "f"),
        "men": sum(1 for p in out_players if p["gender"] == "m"),
        "gk": sum(1 for p in out_players if p["grp"] == "gk"),
        "def": sum(1 for p in out_players if p["grp"] == "def"),
        "mid": sum(1 for p in out_players if p["grp"] == "mid"),
        "fwd": sum(1 for p in out_players if p["grp"] == "fwd"),
        "noPosition": sum(1 for p in out_players if p["grp"] == "unknown"),
        "withTeam": sum(1 for p in out_players if p["stints"]),
        "withPosition": sum(1 for p in out_players if p["pos"]),
        "withPhoto": sum(1 for p in out_players if p["img"]),
        "withCountry": sum(1 for p in out_players if p["country_iso"]),
        "withDob": sum(1 for p in out_players if p["dob"]),
        "withHeight": sum(1 for p in out_players if p["height_cm"]),
        "withMass": sum(1 for p in out_players if p["weight_kg"]),
        "withWiki": sum(1 for p in out_players if p["wiki"]),
        "withCaps": sum(1 for p in out_players if p["apps"]),
        "withNatCaps": sum(1 for p in out_players if p["nat_caps"]),
        "active": sum(1 for p in out_players if p["is_open"]),
        "stints": len(stints),
        "droppedFictional": dropped_fictional,
        "droppedNames": dropped_nameless,
        "source": "Wikidata (CC0) via the QLever mirror qlever.dev/api/wikidata",
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    os.makedirs(DATA, exist_ok=True)
    build_sqlite(os.path.join(DATA, "catalogue.sqlite"), out_players, stints, used_teams,
                 used_countries, used_positions, stats)
    with open(os.path.join(DATA, "stats.json"), "w", encoding="utf-8") as fh:
        json.dump(stats, fh, indent=1)
    with gzip.open(os.path.join(DATA, "positions.json.gz"), "wt", encoding="utf-8",
                   compresslevel=9) as fh:
        json.dump({"positions": used_positions,
                   "countries": [{"q": c["q"], "name": c["name"], "iso2": c["iso2"],
                                  "iso3": c["iso3"], "players": c["players"]}
                                 for c in used_countries]}, fh, ensure_ascii=False)
    print(json.dumps(stats, indent=1), flush=True)
    print("db size: %.1f MB" % (os.path.getsize(os.path.join(DATA, "catalogue.sqlite")) / 1e6))


def main():
    args = sys.argv[1:] or ["all"]
    if args[0] == "build":
        do_build()
    elif args[0] == "fetch":
        fetch_step(args[1], force="--force" in args)
    elif args[0] == "status":
        do_status()
    else:
        do_fetch(force="--force" in args)
        do_build()


if __name__ == "__main__":
    main()
