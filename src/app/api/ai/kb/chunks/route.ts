import { NextResponse } from 'next/server'
import { listChunks } from '@/lib/agent/rag'

export async function GET() {
  const results = await listChunks()
  return NextResponse.json({ success: true, data: results })
}
