import { NextRequest, NextResponse } from 'next/server'
import { getMcpTools, streamAgentResponse } from '@/lib/agent/agent'

export async function GET() {
  const tools = getMcpTools()
  return NextResponse.json({ success: true, data: tools })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const input = body?.input ?? body ?? {}
    const stream = await streamAgentResponse(input)

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error: any) {
    console.error('Agent API error', error)
    return NextResponse.json({ success: false, message: 'Agent 服务异常' }, { status: 500 })
  }
}
