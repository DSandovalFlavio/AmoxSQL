const apiKey = "sk-cp-nsgrpXS-jzWdlOGx1ICxb-HF0u3bbS4rhInk0nS0OYeMW22ggUCQsc3lWBoEGZMla1HSlK_DN90y9WUNs-REk5c147bH67Q2qxLLs1O9ayT_EuIamDBfVck";

async function testOpenAI() {
  const res = await fetch('https://api.minimax.io/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [{ role: 'user', content: 'hola' }]
    })
  });
  console.log(res.status, await res.text());
}
testOpenAI();
