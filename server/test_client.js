const http = require('http');

const data = JSON.stringify({
  messages: [{ role: 'user', content: 'hola que puedes hacer?' }],
  provider: 'ollama',
  model: 'qwen3.5:2b',
  mode: 'assistant'
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 3001,
  path: '/api/ai/chat/stream',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
