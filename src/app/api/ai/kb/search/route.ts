import { NextRequest, NextResponse } from 'next/server'
import { search } from '@/lib/agent/rag'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { query, topK, scoreThreshold } = body || {}
  const results = await search({ query, topK, scoreThreshold })
  return NextResponse.json({ success: true, data: results })
}
