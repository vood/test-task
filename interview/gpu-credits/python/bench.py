#!/usr/bin/env python3
"""Local browser bench for the CreditSystem exercise.

    python3 interview/gpu-credits/python/bench.py

Serves the editor at http://127.0.0.1:8765 and runs your code with the
interpreter you launched it with. Standard library only, no network, no
install. Every run happens in a throwaway subprocess with a timeout, so an
infinite loop costs you one run, not the bench.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "bench.template.html")
TESTS = os.path.join(HERE, "test_credit_system.py")

# Executed in a subprocess: reads {code, skip_optional} on stdin, writes the
# report on stdout. Kept here so the bench is a single file to copy around.
WORKER = r"""
import importlib.util, json, sys

payload = json.loads(sys.stdin.read())
spec = importlib.util.spec_from_file_location("credit_tests", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module  # dataclasses resolve annotations through sys.modules
spec.loader.exec_module(module)
sys.stdout.write(module.run_all(payload["code"], payload.get("skip_optional", False)))
"""


def page(server_backend: bool) -> bytes:
    """Build the bench page with the current test suite inlined."""
    with open(TEMPLATE, encoding="utf-8") as handle:
        html = handle.read()
    with open(TESTS, encoding="utf-8") as handle:
        tests = handle.read()
    # the suite lives in a non-executed script block, so only </script> can break out
    html = html.replace("{{TESTS_SOURCE}}", tests.replace("</script>", "<\\/script>"))
    if server_backend:
        html = html.replace("<body>", "<body>\n<script>window.__BENCH_SERVER__ = true;</script>", 1)
    return html.encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    timeout_seconds = 30

    def log_message(self, fmt, *args):  # quiet by default
        if self.server.verbose:  # type: ignore[attr-defined]
            super().log_message(fmt, *args)

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path in ("/", "/index.html", "/bench.html"):
            self._send(200, page(server_backend=True), "text/html; charset=utf-8")
        elif path == "/favicon.ico":
            self._send(200, b"", "image/x-icon")
        else:
            self._send(404, b"not found", "text/plain; charset=utf-8")

    def do_POST(self) -> None:
        if self.path.split("?")[0] != "/run":
            self._send(404, b"not found", "text/plain; charset=utf-8")
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send(400, b'{"crash": "malformed request"}', "application/json")
            return

        request = json.dumps(
            {"code": payload.get("code", ""), "skip_optional": bool(payload.get("skip_optional"))}
        )

        try:
            finished = subprocess.run(
                [sys.executable, "-c", WORKER, TESTS],
                input=request,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
                cwd=HERE,
            )
        except subprocess.TimeoutExpired:
            self._send(200, json.dumps({"timeout": self.timeout_seconds}).encode(), "application/json")
            return

        if finished.returncode != 0:
            body = json.dumps({"crash": (finished.stderr or "the test runner exited unexpectedly").strip()})
            self._send(200, body.encode(), "application/json")
            return

        self._send(200, finished.stdout.encode("utf-8"), "application/json")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser window")
    parser.add_argument("--verbose", action="store_true", help="log every request")
    parser.add_argument(
        "--build",
        metavar="PATH",
        help="write a standalone bench.html (runs Python via Pyodide) and exit",
    )
    args = parser.parse_args()

    if args.build:
        with open(args.build, "wb") as handle:
            handle.write(page(server_backend=False))
        print(f"wrote {args.build}")
        return 0

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.verbose = args.verbose  # type: ignore[attr-defined]
    url = f"http://{args.host}:{args.port}/"
    print(f"GPU Credit Bench — {url}")
    print(f"running your code with {sys.executable}")
    print("ctrl-c to stop")

    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
