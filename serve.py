import os
import re
from http.server import HTTPServer, SimpleHTTPRequestHandler


class SSIServer(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Only process includes on HTML files
        if not self.path.endswith('.html'):
            return super().do_GET()

        file_path = self.translate_path(self.path)
        if not os.path.isfile(file_path):
            return super().do_GET()

        with open(file_path, 'r') as f:
            content = f.read()

        # Replace SSI includes with file contents
        content = re.sub(
            r'<!--#include\s+virtual="([^"]+)"-->',
            lambda m: self._read_section(m.group(1), os.path.dirname(file_path)),
            content
        )

        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(content.encode())

    def _read_section(self, rel_path, base_dir):
        full_path = os.path.normpath(os.path.join(base_dir, rel_path))
        if not full_path.startswith(os.path.normpath(base_dir)):
            return '<!-- access denied -->'
        try:
            with open(full_path, 'r') as f:
                return '\n' + f.read().strip() + '\n'
        except FileNotFoundError:
            return f'<!-- missing: {rel_path} -->'


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(('localhost', port), SSIServer)
    print(f'  → http://localhost:{port}')
    print('  Press Ctrl+C to stop')
    server.serve_forever()
