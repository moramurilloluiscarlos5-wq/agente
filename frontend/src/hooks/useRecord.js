import { useEffect, useState } from 'react'
import { api } from '../services/api.js'

// Carga un registro por URL. Usa `seed` (por ejemplo, el registro que ya estaba en la lista) mientras llega.
export function useRecord(path, seed = null) {
  const [state, setState] = useState({ path: null, record: null, error: null })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!path) return undefined
    let active = true
    api.get(path)
      .then((response) => { if (active) setState({ path, record: response.data ?? response, error: null }) })
      .catch((error) => { if (active) setState({ path, record: null, error }) })
    return () => { active = false }
  }, [path, revision])
  const settled = state.path === path
  return {
    record: path ? (settled ? state.record : seed) : null,
    error: settled ? state.error : null,
    loading: Boolean(path) && !settled && !seed,
    reload: () => setRevision((value) => value + 1),
  }
}
