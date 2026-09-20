import { useEffect, useState } from 'react'
import { api } from '../services/api.js'

export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useDirectoryRecords(path) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState({ path: null, version: 0, payload: null, error: '' })
  useEffect(() => {
    let active = true
    if (!path) return () => { active = false }
    api.get(path).then(
      (payload) => { if (active) setResult({ path, version, payload, error: '' }) },
      (error) => { if (active) setResult({ path, version, payload: null, error: error.message }) },
    )
    return () => { active = false }
  }, [path, version])
  const settled = path && result.path === path && result.version === version
  return {
    payload: settled ? result.payload : null,
    error: settled ? result.error : '',
    loading: Boolean(path && !settled),
    reload: () => setVersion((current) => current + 1),
  }
}
