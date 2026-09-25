#!/usr/bin/env python3
"""Dev server for the HYPRFRAME redesign preview.
   - Sends no-cache headers (no stale copies)
   - Live-reload: /__livereload (SSE) notifies the page when watched files change,
     so the preview refreshes itself automatically.
   NOTE: development-only server; production stays on the normal hosting."""
import os
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
WATCH = ["index.html", "styles.css", "script.js", "project-node.html", "project-node.css", "project-node.js"]

_version = 0
_last = 0.0
_clients = []  # list of per-client queues
_lock = threading.Lock()


def _scan():
    m = 0.0
    for f in WATCH:
        p = os.path.join(ROOT, f)
        if os.path.exists(p):
            m = max(m, os.path.getmtime(p))
    return m


_last = _scan()


def _watcher():
    """Poll watched files; bump version and ping all SSE clients on change."""
    global _version, _last
    while True:
        time.sleep(0.8)
        cur = _scan()
        if cur != _last:
            _last = cur
            with _lock:
                _version += 1
                for q in _clients:
                    q.append(_version)


threading.Thread(target=_watcher, daemon=True).start()


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # only log real page/asset requests from outside, for diagnostics
        msg = fmt % args
        if "127.0.0.1" not in (self.client_address[0] or ""):
            import sys
            sys.stderr.write("%s - %s\n" % (self.client_address[0], msg))
            sys.stderr.flush()

    def do_GET(self):
        if self.path.startswith("/__livereload"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            q = []
            with _lock:
                v = _version
                _clients.append(q)
            try:
                self.wfile.write(f"retry: 1000\ndata: v{v}\n\n".encode())
                self.wfile.flush()
                while True:
                    while not q:
                        time.sleep(0.3)
                    newv = q.pop(0)
                    self.wfile.write(f"data: v{newv}\n\n".encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                with _lock:
                    if q in _clients:
                        _clients.remove(q)
            return
        super().do_GET()


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
