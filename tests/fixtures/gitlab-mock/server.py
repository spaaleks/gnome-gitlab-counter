#!/usr/bin/env python3

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(ROOT, 'responses')
# Bind: 127.0.0.1:18080 (matches config/e2e.json's instance URL).
PORT = int(os.environ.get('GLCOUNTER_MOCK_PORT', '18080'))


class Handler(BaseHTTPRequestHandler):
    def _send(self, body: bytes, status: int = 200) -> None:
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, name: str) -> None:
        path = os.path.join(FIXTURES, name)
        if not os.path.isfile(path):
            self._send(b'{"error":"missing fixture"}', 404)
            return
        with open(path, 'rb') as f:
            self._send(f.read())

    def do_GET(self) -> None:
        url = urlparse(self.path)
        params = parse_qs(url.query)

        if url.path.startswith('/api/v4/projects/') and url.path.endswith('/approvals'):
            self._send_file('approvals.json')
            return
        if url.path == '/api/v4/issues':
            self._send_file('issues.json')
            return
        if url.path == '/api/v4/merge_requests':
            if params.get('wip', [''])[0] == 'yes':
                self._send_file('drafts.json')
            elif 'reviewer_username' in params:
                self._send_file('reviews.json')
            elif 'author_username' in params:
                self._send_file('mrs.json')
            else:
                self._send(b'[]')
            return
        self._send(b'{"error":"unmocked path"}', 404)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write('mock %s - %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    HTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
