import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function main() {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: 'Reply with exactly: "API working." Nothing else.',
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  console.log('Response:', text)
  console.log('Tokens used:', message.usage)
  console.log('Estimated cost: ~$', (message.usage.input_tokens * 0.0000008 + message.usage.output_tokens * 0.000004).toFixed(6))
}

main().catch(console.error)