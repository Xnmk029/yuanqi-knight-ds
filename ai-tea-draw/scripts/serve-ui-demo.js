'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../ui-demo');

function createDemoServer({ port = 5890 } = {}) {
  const routes = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/demo.css': ['demo.css', 'text/css; charset=utf-8'],
    '/demo.js': ['demo.js', 'text/javascript; charset=utf-8'],
    '/research.js': ['research.js', 'text/javascript; charset=utf-8'],
    '/research.md': ['research.md', 'text/plain; charset=utf-8']
  };
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const route = routes[pathname];
    if (!route || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    fs.readFile(path.join(root, route[0]), (error, data) => {
      if (error) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Demo file unavailable');
        return;
      }
      response.writeHead(200, {
        'Content-Type': route[1],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      });
      response.end(request.method === 'HEAD' ? undefined : data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve({ server, url: 'http://127.0.0.1:' + server.address().port });
    });
  });
}
if (require.main === module) {
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex >= 0 ? Number(process.argv[portIndex+1]) : 5890;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  createDemoServer({ port }).then(({ server, url }) => {
    console.log(JSON.stringify({ event: 'ready', url, mode: 'ui-demo', pid: process.pid }));
    process.once('SIGINT', () => server.close(() => process.exit(0)));
    process.once('SIGTERM', () => server.close(() => process.exit(0)));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { createDemoServer };
