import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

// Sirve el frontend compilado y devuelve index.html para las rutas de la SPA.
// Sin carpeta public (modo desarrollo) no sirve nada y el 404 JSON sigue activo.
export function mountSpa(app, publicDir) {
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, {
      index: false,
      setHeaders(res, filePath) {
        // index.html SIEMPRE sin caché: si un navegador conservara el HTML viejo
        // tras un deploy, seguiría pidiendo un bundle antiguo (404) o uno viejo
        // con URLs horneadas incorrectas. Los assets con hash sí son inmutables.
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-store')
          return
        }
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }))
    // Una pestaña abierta antes de un deploy sigue pidiendo assets con el hash anterior.
    // Responder index.html (200) haría que el navegador intente ejecutar HTML como
    // JavaScript; un 404 real permite al frontend detectar la versión nueva y recargar.
    app.use('/assets', (_req, res) => {
      res.status(404).set('Cache-Control', 'no-store').type('text/plain').send('Not found')
    })
  }
  // Fallback SPA para rutas que no sean API. (El 404 JSON sigue activo para el resto.)
  app.get(/^\/(?!api(?:\/|$)).*/, (req, res, next) => {
    if (!fs.existsSync(publicDir)) return next()
    res.setHeader('Cache-Control', 'no-store')
    res.sendFile(path.join(publicDir, 'index.html'))
  })
}
