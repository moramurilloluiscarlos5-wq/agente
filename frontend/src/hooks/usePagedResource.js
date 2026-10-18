import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { useDebouncedValue } from './useDirectoryRecords.js'

// Lista paginada con búsqueda y filtros, conectada a un endpoint real.
// Devuelve lo que informa el servidor; nunca datos de ejemplo.
export function usePagedResource(basePath, { filters = {}, limit = 20 } = {}) {
  const [page, setPage] = useState(1)
  const [query, setQueryState] = useState('')
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState({ key: null, rows: [], count: 0, error: null })
  const debouncedQuery = useDebouncedValue(query, 300)
  const filterKey = JSON.stringify(filters)

  // Al cambiar filtros se vuelve a la primera página (se ajusta durante el render).
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (lastFilterKey !== filterKey) { setLastFilterKey(filterKey); setPage(1) }

  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim())
  for (const [key, value] of Object.entries(JSON.parse(filterKey))) if (value) params.set(key, value)
  const url = `${basePath}?${params}`
  const requestKey = `${url}#${version}`

  useEffect(() => {
    let active = true
    api.get(url).then((response) => {
      if (!active) return
      const count = response.count ?? response.data?.length ?? 0
      const lastPage = Math.max(1, Math.ceil(count / limit))
      if (page > lastPage) { setPage(lastPage); return }
      setResult({ key: requestKey, rows: response.data ?? [], count, error: null })
    }).catch((error) => {
      if (active) setResult((current) => ({ ...current, key: requestKey, error }))
    })
    return () => { active = false }
  }, [url, requestKey, page, limit])

  const setQuery = useCallback((value) => { setQueryState(value); setPage(1) }, [])
  const reload = useCallback(() => setVersion((value) => value + 1), [])
  return { rows: result.rows, count: result.count, error: result.key === requestKey ? result.error : null, loading: result.key !== requestKey, page, setPage, limit, query, setQuery, reload }
}
