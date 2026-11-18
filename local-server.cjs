const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, 'dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500).end('File unavailable');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

let port = 5178;
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < 5198) {
    server.listen(++port, '127.0.0.1');
    return;
  }
  console.error('本地服务启动失败：', error.message);
  process.exitCode = 1;
});
server.on('listening', () => {
  const address = `http://127.0.0.1:${port}/`;
  console.log(`青岬港已启动：${address}`);
  console.log('请保持此窗口打开。按 Control + C 可以停止服务。');
  const opener = spawn('open', [address], { stdio: 'ignore' });
  opener.on('error', () => console.log('请将上面的地址复制到浏览器中打开。'));
});
server.listen(port, '127.0.0.1');
