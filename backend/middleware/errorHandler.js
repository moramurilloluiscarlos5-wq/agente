export function notFoundHandler(_req, res) {
  res.status(404).json({ message: 'Recurso no encontrado' })
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  console.error('Request failed', {
    status: err.status ?? 500,
    code: err.code ?? null,
    message: err.message ?? null,
  })
  const status = err.status ?? 500
  res.status(status).json({ message: err.publicMessage ?? 'Error interno del servidor' })
}
