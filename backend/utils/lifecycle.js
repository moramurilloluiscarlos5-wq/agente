// Cierre ordenado del servidor HTTP. Railway manda SIGTERM en cada deploy y SIGKILL pasados
// RAILWAY_DEPLOYMENT_DRAINING_SECONDS (0 por defecto): se dejan de aceptar conexiones, se esperan
// las peticiones en curso y se sale antes de que llegue el SIGKILL.
// Un rechazo sin capturar se registra y el servidor sigue; una excepción sin capturar deja el estado
// en duda, así que se cierra en orden y se sale con código 1 para que Railway reinicie el servicio.
export function installLifecycleHandlers({
  server,
  logger = console,
  timeoutMs = 10_000,
  onShutdown,
  proc = process,
  exit = (code) => process.exit(code),
}) {
  let closing = false

  function shutdown(reason, exitCode = 0) {
    if (closing) return
    closing = true
    logger.info(`Cierre ordenado (${reason}): se esperan las peticiones en curso.`)

    // Cierra las conexiones keep-alive en cuanto quedan libres; si no, close() esperaría su timeout.
    const idleSweep = setInterval(() => server.closeIdleConnections?.(), 100)
    const forceTimer = setTimeout(() => {
      clearInterval(idleSweep)
      logger.error(`El cierre ordenado superó ${timeoutMs} ms: se cierran las conexiones abiertas.`)
      server.closeAllConnections?.()
      exit(1)
    }, timeoutMs)

    server.close(async (error) => {
      clearTimeout(forceTimer)
      clearInterval(idleSweep)
      if (error) logger.error('Error al cerrar el servidor', error)
      try {
        await onShutdown?.()
      } catch (hookError) {
        logger.error('Error al liberar recursos en el cierre', hookError)
      }
      exit(error ? 1 : exitCode)
    })
    server.closeIdleConnections?.()
  }

  proc.on('SIGTERM', () => shutdown('SIGTERM'))
  proc.on('SIGINT', () => shutdown('SIGINT'))
  proc.on('unhandledRejection', (reason) => logger.error('Promesa rechazada sin capturar', reason))
  proc.on('uncaughtException', (error) => {
    logger.error('Excepción sin capturar', error)
    shutdown('uncaughtException', 1)
  })

  return { shutdown }
}
