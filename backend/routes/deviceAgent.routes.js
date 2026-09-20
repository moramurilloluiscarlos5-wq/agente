import { Router } from 'express'
import { getDeviceAgentRelease } from '../services/deviceAgentRelease.js'

export function createDeviceAgentRouter({ getRelease = getDeviceAgentRelease } = {}) {
  const router = Router()
  router.get('/latest-version', async (_req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store')
      res.json(await getRelease())
    } catch (error) { next(error) }
  })
  router.get('/download', async (_req, res, next) => {
    try {
      const release = await getRelease()
      res.setHeader('Cache-Control', 'no-store')
      res.redirect(302, release.downloadUrl)
    } catch (error) { next(error) }
  })
  return router
}

export default createDeviceAgentRouter()
