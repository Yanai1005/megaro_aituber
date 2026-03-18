import { Agent } from '@mastra/core/agent'
import { Message } from '@/features/messages/messages'
import { ModelMessage } from 'ai'
import { VercelAIService } from '@/features/constants/settings'
import { ProviderParams, createAIRegistry, getLanguageModel } from './vercelAi'

type BuildAgentParams = {
  service: VercelAIService
  params: ProviderParams
  model: string
  systemPrompt?: string
  options?: Record<string, unknown>
}

function buildMastraAgent({
  service,
  params,
  model,
  systemPrompt = '',
  options = {},
}: BuildAgentParams) {
  const registry = createAIRegistry(service, params)
  if (!registry) return null

  const languageModel = getLanguageModel(registry, service, model, options)

  return new Agent({
    id: 'aituber-chat',
    name: 'AITuber Chat Agent',
    instructions: systemPrompt,
    model: languageModel as any,
  })
}

function extractSystemAndChatMessages(messages: Message[]): {
  systemPrompt: string
  chatMessages: ModelMessage[]
} {
  const systemMessages = messages.filter((m) => m.role === 'system')
  const chatMessages = messages.filter(
    (m) => m.role !== 'system'
  ) as ModelMessage[]
  const systemPrompt = systemMessages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n')

  return { systemPrompt, chatMessages }
}

/**
 * fullStream の各チャンクを UI Message Stream Protocol (SSE) にエンコードする
 * https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
 */
function buildSseResponse(
  stream: AsyncIterable<string | { type: string; textDelta?: string; [key: string]: unknown }>
): Response {
  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        for await (const chunk of stream) {
          if (typeof chunk === 'string') {
            if (chunk) send({ type: 'text-delta', delta: chunk })
          } else if (chunk.type === 'text-delta' && chunk.textDelta) {
            send({ type: 'text-delta', delta: chunk.textDelta })
          } else if (chunk.type === 'reasoning' && chunk.textDelta) {
            send({ type: 'reasoning-delta', delta: chunk.textDelta })
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        send({ type: 'error', errorText: errorMessage })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

export async function streamWithMastraAgent({
  service,
  params,
  model,
  messages,
  temperature,
  maxTokens,
  options = {},
  providerOptions,
}: {
  service: VercelAIService
  params: ProviderParams
  model: string
  messages: Message[]
  temperature: number
  maxTokens: number
  options?: Record<string, unknown>
  providerOptions?: Record<string, Record<string, unknown>>
}) {
  const { systemPrompt, chatMessages } = extractSystemAndChatMessages(messages)
  const agent = buildMastraAgent({ service, params, model, systemPrompt, options })

  if (!agent) {
    return new Response(
      JSON.stringify({ error: 'Invalid AI service', errorCode: 'InvalidAIService' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const result = await agent.stream(chatMessages as any, {
      temperature,
      maxOutputTokens: maxTokens,
      ...(providerOptions && { providerOptions: providerOptions as any }),
    } as any)

    return buildSseResponse((result as any).textStream ?? (result as any).fullStream)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Mastra Agent Stream Error: ${errorMessage}`)
    console.error(`Model: ${model}, Temperature: ${temperature}`)

    return new Response(
      JSON.stringify({
        error: `AI Service Error: ${errorMessage}`,
        errorCode: 'AIServiceError',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function generateWithMastraAgent({
  service,
  params,
  model,
  messages,
  temperature,
  maxTokens,
  providerOptions,
}: {
  service: VercelAIService
  params: ProviderParams
  model: string
  messages: Message[]
  temperature: number
  maxTokens: number
  providerOptions?: Record<string, Record<string, unknown>>
}) {
  const { systemPrompt, chatMessages } = extractSystemAndChatMessages(messages)
  const agent = buildMastraAgent({ service, params, model, systemPrompt })

  if (!agent) {
    return new Response(
      JSON.stringify({ error: 'Invalid AI service', errorCode: 'InvalidAIService' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const result = await agent.generate(chatMessages as any, {
      temperature,
      maxOutputTokens: maxTokens,
      ...(providerOptions && { providerOptions: providerOptions as any }),
    } as any)

    return new Response(JSON.stringify({ text: result.text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Mastra Agent Generate Error: ${errorMessage}`)
    console.error(`Model: ${model}, Temperature: ${temperature}`)

    return new Response(
      JSON.stringify({
        error: `AI Service Error: ${errorMessage}`,
        errorCode: 'AIServiceError',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
