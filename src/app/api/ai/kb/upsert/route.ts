import { NextRequest, NextResponse } from 'next/server'
import { upsertDocument } from '@/lib/agent/rag'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { sourceId, title, content, metadata } = body || {}

  if (!sourceId || !content) {
    return NextResponse.json({ success: false, message: 'sourceId 与 content 必填' }, { status: 400 })
  }

  const result = await upsertDocument({ sourceId, title, content, metadata })
  return NextResponse.json({ success: true, data: result })
}
