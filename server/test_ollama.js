const { streamText } = require('ai');
const { createOllama } = require('ai-sdk-ollama');
const ollama = createOllama();

async function main() {
    try {
        const model = ollama('qwen3.5:2b');
        console.log('Sending request to Ollama using ai-sdk-ollama...');
        const result = streamText({
            model: model,
            messages: [{ role: 'user', content: 'hola que puedes hacer?' }],
            maxSteps: 10,
            tools: {
                get_time: {
                    description: 'Get the current time',
                    parameters: { type: 'object', properties: {} },
                    execute: async () => { return new Date().toISOString(); }
                }
            }
        });
        
        for await (const chunk of result.fullStream) {
            console.log(chunk);
        }
        console.log('DONE');
    } catch (e) {
        console.error('ERROR (Synchronous):', e);
    }
}
main();
