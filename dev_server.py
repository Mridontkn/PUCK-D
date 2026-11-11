"""Local dev server: serves the static site and mimics the Netlify NHL proxy.

    python3 dev_server.py          # http://127.0.0.1:8080
    python3 dev_server.py 8090     # another port

Only /.netlify/functions/nhl?feed=score|standings|leaders|goalies|defense|rookies is proxied (same allowlist as
netlify/functions/nhl.js). Everything else is served from this directory.
"""
import http.server
import os
import re
import socketserver
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# python.org builds of Python ship without CA certs; fall back to macOS's bundle.
_CA = "/etc/ssl/cert.pem"
SSL_CTX = ssl.create_default_context(cafile=_CA if os.path.exists(_CA) else None)

FEEDS = {
    "score": "https://api-web.nhle.com/v1/score/now",
    "standings": "https://api-web.nhle.com/v1/standings/now",
    "leaders": "https://api-web.nhle.com/v1/skater-stats-leaders/current?categories=points,goals,assists&limit=10",
    "goalies": "https://api-web.nhle.com/v1/goalie-stats-leaders/current?categories=wins,savePctg,goalsAgainstAverage,shutouts&limit=10",
}


def _season_id(now=None):
    """NHL season id (e.g. 20262027); a new season starts in September."""
    import datetime
    now = now or datetime.datetime.now(datetime.timezone.utc)
    start = now.year if now.month >= 9 else now.year - 1
    return f"{start}{start + 1}"


def _skater_summary(filt):
    import json as _json
    season = _season_id()
    params = urllib.parse.urlencode({
        "isAggregate": "false",
        "isGame": "false",
        "sort": _json.dumps([{"property": "points", "direction": "DESC"}, {"property": "goals", "direction": "DESC"}]),
        "start": "0",
        "limit": "50",
        "cayenneExp": f"gameTypeId=2 and seasonId<={season} and seasonId>={season} and {filt}",
    })
    return f"https://api.nhle.com/stats/rest/en/skater/summary?{params}"


FEEDS["defense"] = _skater_summary('positionCode="D"')
FEEDS["rookies"] = _skater_summary("isRookie=1")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/.netlify/functions/nhl":
            qs = urllib.parse.parse_qs(parsed.query)
            feed = qs.get("feed", [""])[0]
            url = FEEDS.get(feed)
            date = qs.get("date", [""])[0]
            if feed == "score" and date:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
                    return self._send(400, b'{"error":"bad date"}')
                url = f"https://api-web.nhle.com/v1/score/{date}"
            if not url:
                return self._send(400, b'{"error":"unknown feed"}')
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "puckd-dev"})
                with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
                    return self._send(200, resp.read())
            except Exception as exc:  # noqa: BLE001 - dev tool, report and move on
                return self._send(502, ('{"error":"%s"}' % type(exc).__name__).encode())
        return super().do_GET()

    def _send(self, status, body):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", port), Handler) as httpd:
        print(f"PUCK'D dev server on http://127.0.0.1:{port}")
        httpd.serve_forever()
