const encoder = new TextEncoder()

export type SseController = ReadableStreamDefaultController<Uint8Array>

const write = (controller: SseController, data: string) => {
  controller.enqueue(encoder.encode(data))
}

export const sendEvent = (controller: SseController, payload: unknown) => {
  write(controller, `data: ${JSON.stringify(payload)}\n\n`)
}

export const sendDone = (controller: SseController) => {
  write(controller, 'data: [DONE]\n\n')
}

export const startHeartbeat = (controller: SseController, intervalMs: number) => {
  const timer = setInterval(() => {
    write(controller, ': ping\n\n')
  }, intervalMs)
  return () => clearInterval(timer)
}
