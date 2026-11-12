"""
Simple HTTP server that serves the frontend with no-cache headers.
Prevents browser from serving stale ES module files.
Usage:  python serve.py
Then open:  http://localhost:8080
"""
import http.server
import socketserver

PORT = 8080

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Force browser to always fetch fresh files — never serve from cache
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress per-request noise; only print startup message
        pass

print(f"Dashboard:  http://localhost:{PORT}")
print("Press Ctrl+C to stop.\n")

with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    httpd.serve_forever()
