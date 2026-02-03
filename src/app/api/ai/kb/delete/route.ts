import { NextRequest, NextResponse } from 'next/server'
import { removeBySource } from '@/lib/agent/rag'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { sourceId } = body || {}

  if (!sourceId) {
    return NextResponse.json({ success: false, message: 'sourceId 必填' }, { status: 400 })
  }

  const result = await removeBySource(sourceId)
  return NextResponse.json({ success: true, data: result })
}
