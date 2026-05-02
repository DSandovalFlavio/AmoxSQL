import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const minimax = createOpenAI({
  apiKey: "sk-cp-nsgrpXS-jzWdlOGx1ICxb-HF0u3bbS4rhInk0nS0OYeMW22ggUCQsc3lWBoEGZMla1HSlK_DN90y9WUNs-REk5c147bH67Q2qxLLs1O9ayT_EuIamDBfVck",
  baseURL: 'https://api.minimax.io/v1',
  compatibility: 'compatible'
});

async function main() {
  try {
    const { text } = await generateText({
      model: minimax('MiniMax-M2.7'),
      prompt: 'Hola que puedes hacer?',
    });
    console.log("Success:", text);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
