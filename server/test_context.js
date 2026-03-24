const http = require('http');

const data = JSON.stringify({
  messages: [{ role: 'user', content: 'quiero obtener las regiones con mayores clicks obtener el top 10' }],
  provider: 'ollama',
  model: 'lfm2.5-thinking:latest',
  mode: 'diving',
  contextFiles: [{ name: 'dataset.csv', path: 'bad_path_just_to_test_if_it_throws' }] // mock path
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
  res.setEncoding('utf8');
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
