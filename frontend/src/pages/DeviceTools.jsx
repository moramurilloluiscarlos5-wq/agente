import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, Download, Info, LoaderCircle, MonitorDown, RefreshCw, RotateCcw, ShieldCheck, Smartphone, Terminal, Usb, Zap } from 'lucide-react'
import { api } from '../services/api.js'
import { openDeviceAgent } from '../services/deviceAgent.js'
import DeviceAgentRelease from '../components/DeviceAgentRelease.jsx'

const panel = 'ct-surface-raised p-5'
const button = 'ct-btn ct-btn-secondary'
const primary = 'ct-btn ct-btn-primary'

function value(value) { return value === null || value === undefined || value === '' ? 'No disponible' : String(value) }
function prettyBytes(kb) { if (!Number.isFinite(kb)) return 'No disponible'; const gb = kb / 1024 / 1024; return `${gb >= 1 ? gb.toFixed(1) + ' GB' : Math.round(kb / 1024) + ' MB'}` }

export default function DeviceTools() {
  const [agent, setAgent] = useState(null)
  const [devices, setDevices] = useState([])
  const [fastbootDevices, setFastbootDevices] = useState([])
  const [selected, setSelected] = useState('')
  const [mode, setMode] = useState('adb')
  const [info, setInfo] = useState(null)
  const [fastbootInfo, setFastbootInfo] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [output, setOutput] = useState('')
  const [logs, setLogs] = useState([])
  const [shellQuery, setShellQuery] = useState('battery')
  const [stage, setStage] = useState('diagnostico')
  const [repairOrderId, setRepairOrderId] = useState('')
  const [notes, setNotes] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [destination, setDestination] = useState('/sdcard/Download/archivo')
  const [agentDiagnostics, setAgentDiagnostics] = useState(null)
  const [localFiles, setLocalFiles] = useState([])
  const [aiResult, setAiResult] = useState(null)
  const [agentPairing, setAgentPairing] = useState(null)
  const [agentUnavailable, setAgentUnavailable] = useState(false)
  const socketRef = useRef(null)

  const currentList = mode === 'adb' ? devices : fastbootDevices
  const currentDevice = currentList.find((item) => item.serial === selected)
  const title = info?.model || currentDevice?.model || info?.product || 'Dispositivo Android'
  const connected = Boolean(selected && currentDevice && (mode === 'fastboot' || currentDevice.state === 'device'))
  const activateAgent = useCallback((connection) => {
    setAgent(connection)
    setAgentPairing(null)
    setAgentUnavailable(false)
    const socket = connection.connect((message) => {
      if (message.type === 'devices.changed') { setDevices(message.data.adb || []); setFastbootDevices(message.data.fastboot || []) }
      if (message.type === 'agent.log') { setLogs((current) => [...current.slice(-79), message.data]); if (message.data.level === 'error') setError(message.data.message) }
      if (message.type === 'agent.ready') (message.data.logs || []).forEach((entry) => setLogs((current) => [...current.slice(-79), entry]))
    }, () => {
      setAgent(null)
      setAgentUnavailable(true)
      setLogs((current) => [...current.slice(-79), { at: new Date().toISOString(), level: 'warn', message: 'Device Agent desconectado.' }])
    })
    socketRef.current = socket
  }, [])

  const checkConnection = useCallback(async () => {
    try {
      const connection = await openDeviceAgent()
      if (connection.pairingRequired) { setAgent(null); setAgentPairing(connection); setAgentUnavailable(false); return }
      activateAgent(connection)
    } catch (err) { setAgent(null); setAgentUnavailable(true); setAgentPairing(null); setError(err.message) }
  }, [activateAgent])

  const refresh = useCallback(async () => {
    if (!agent) return
    try {
      const [adb, fastboot, files] = await Promise.all([agent.request('/devices'), agent.request('/fastboot/devices'), agent.request('/files')])
      setDevices(adb.devices || []); setFastbootDevices(fastboot.devices || [])
      setLocalFiles(files.files || [])
      if (mode === 'adb' && !selected && adb.devices?.[0]) setSelected(adb.devices[0].serial)
      if (mode === 'fastboot' && !selected && fastboot.devices?.[0]) setSelected(fastboot.devices[0].serial)
    } catch (err) { setError(err.message) }
  }, [agent, mode, selected])

  useEffect(() => {
    checkConnection()
    return () => socketRef.current?.close()
  }, [checkConnection])

  useEffect(() => {
    if (agent || agentPairing) return undefined
    const timer = setInterval(checkConnection, 2500)
    return () => clearInterval(timer)
  }, [agent, agentPairing, checkConnection])

  useEffect(() => { if (agent) refresh() }, [agent, mode, refresh])
  useEffect(() => { if (!selected || !agent) return; setInfo(null); setFastbootInfo(null) }, [agent, selected])

  async function call(path, { command = path, mode: commandMode = mode, body = {} } = {}) {
    if (!agent || !selected) return
    setBusy(command); setError(''); setNotice('')
    const started = Date.now()
    try {
      const result = await agent.request(path, { method: 'POST', body: JSON.stringify(body) })
      const text = typeof result === 'string' ? result : `${result?.stdout || ''}${result?.stderr ? `\n${result.stderr}` : ''}`.trim()
      setOutput(text || 'Correcto. El comando no produjo salida.')
      setNotice('Operación completada.')
      await api.post('/device-tools/audit', { serial: selected, mode: commandMode, command, status: result?.code === 'TIMEOUT' ? 'timeout' : result?.ok === false ? 'error' : 'ok', stdout: result?.stdout || '', stderr: result?.stderr || '', duration_ms: result?.duration_ms ?? Date.now() - started, agent_id: agent.session.agent_id }).catch(() => null)
      return result
    } catch (err) { setError(err.message); await api.post('/device-tools/audit', { serial: selected, mode: commandMode, command, status: 'error', stderr: err.message, duration_ms: Date.now() - started, agent_id: agent.session.agent_id }).catch(() => null) }
    finally { setBusy('') }
  }

  async function loadInfo() {
    if (!agent || !selected) return
    setBusy('info'); setError('')
    try {
      const result = await agent.request(mode === 'adb' ? `/devices/${encodeURIComponent(selected)}/info` : `/fastboot/${encodeURIComponent(selected)}/info`)
      if (mode === 'adb') setInfo(result); else setFastbootInfo(result)
      setNotice('Información real actualizada.')
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  async function saveSnapshot() {
    if (!info) return
    setBusy('snapshot'); setError('')
    try { await api.post('/device-tools/snapshots', { repair_order_id: repairOrderId.trim() || null, customer_id: customerId.trim() || null, serial: info.serial, model: info.model, stage, notes: notes.trim() || null, snapshot: info }); setNotice('Snapshot guardado en el historial del taller.') }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }

  async function checkAgent() {
    if (!agent) return checkConnection()
    setBusy('agent-check'); setError('')
    try { setAgentDiagnostics(await agent.request('/diagnostics')); setNotice('Autodiagnóstico del agente actualizado.') }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }

  async function pairAgent() {
    if (!agentPairing?.pair) return
    setBusy('pair'); setError('')
    try { activateAgent(await agentPairing.pair()); setNotice('Esta computadora quedó vinculada a tu taller.') }
    catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  async function analyzeDevice() {
    if (!info) return
    setBusy('ai'); setError(''); setAiResult(null)
    try {
      const response = await api.post('/ai/diagnose', { device_brand: info.brand || info.manufacturer || 'No disponible', device_model: info.model || 'No disponible', issue: 'Analizar el estado técnico real obtenido por ADB.', symptoms: 'Revisión solicitada por el técnico.', observations: JSON.stringify(info) })
      setAiResult(response.result); setNotice('Análisis IA generado a partir del snapshot real del dispositivo.')
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  const facts = useMemo(() => info ? [
    ['Fabricante', info.manufacturer], ['Marca', info.brand], ['Modelo', info.model], ['Android', info.android], ['SDK', info.sdk], ['Serial', info.serial], ['Build', info.build], ['Fingerprint', info.fingerprint], ['Producto', info.product], ['Codename', info.device], ['Hardware', info.hardware], ['ABI', info.abi], ['Bootloader', info.bootloader], ['Verified Boot', info.verified_boot], ['Slot activo', info.active_slot], ['Resolución', info.display?.size], ['DPI', info.display?.density_dpi], ['IP', info.network?.ip], ['Almacenamiento total', prettyBytes(info.storage?.total_kb)], ['Almacenamiento disponible', prettyBytes(info.storage?.available_kb)], ['RAM total', prettyBytes(info.memory?.total_kb)], ['Tiempo encendido', info.uptime_seconds ? `${Math.round(info.uptime_seconds / 3600)} h` : null],
  ] : [], [info])

  return <div className="ct-page space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Device Tools</p><h1 className="mt-2 text-2xl font-bold tracking-tight">ADB / Fastboot real</h1><p className="mt-1 text-sm text-slate-400">El teléfono permanece conectado al PC del técnico; Railway nunca ejecuta comandos USB.</p></div><div className="flex flex-wrap items-center gap-2"><button className={button} onClick={checkAgent} disabled={!agent || Boolean(busy)}><ShieldCheck size={15} /> Comprobar instalación</button><div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300"><Usb size={15} className={agent ? 'text-emerald-300' : 'text-amber-300'} />{agent ? 'Agent conectado' : 'Conectando Agent…'}</div></div></header>
    {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} className="mt-0.5 shrink-0" />{error}</div>}
    {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}
    <DeviceAgentRelease installedVersion={agent?.health?.version || agentPairing?.health?.version} />
    {agentUnavailable && !agentPairing && <section className={panel}><div className="flex items-start gap-3"><Usb size={22} className="mt-1 text-amber-300" /><div><h2 className="text-lg font-semibold">CarlosTech Device Agent no está conectado</h2><p className="mt-2 text-sm leading-6 text-slate-400">Para detectar dispositivos USB, ADB y Fastboot, CARLOSTECH necesita el agente local instalado en esta computadora.</p></div></div><div className="mt-5 flex flex-wrap gap-3"><button className={button} onClick={checkConnection} disabled={Boolean(busy)}><RefreshCw size={16} /> Ya lo instalé — comprobar nuevamente</button></div><details className="mt-5 rounded-lg border border-slate-800 bg-slate-950/40 p-4"><summary className="cursor-pointer text-sm font-medium text-slate-200">Ver instrucciones</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-400"><li>Descarga e instala CarlosTech Device Agent para Windows.</li><li>Permite que se inicie con Windows cuando el instalador lo solicite.</li><li>Regresa aquí y pulsa «Ya lo instalé».</li><li>Conecta el teléfono por USB y autoriza la depuración desde el equipo.</li></ol></details></section>}
    {agentPairing && <section className={panel}><div className="flex items-start gap-3"><ShieldCheck size={22} className="mt-1 text-cyan-300" /><div><h2 className="text-lg font-semibold">Conectar esta computadora con CARLOSTECH AI</h2><p className="mt-2 text-sm leading-6 text-slate-400">El agente está instalado, pero todavía no está vinculado a tu taller. Confirma el código mostrado por el agente antes de continuar.</p></div></div><div className="mt-5 flex flex-wrap items-center gap-4"><div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-center"><p className="text-[11px] uppercase tracking-widest text-cyan-300">Código de pairing</p><p className="mt-1 font-mono text-2xl font-bold tracking-[0.25em] text-white">{agentPairing.pairingCode || '------'}</p></div><button className={primary} onClick={pairAgent} disabled={busy === 'pair'}>{busy === 'pair' ? <LoaderCircle size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Permitir y vincular</button><button className={button} onClick={checkConnection} disabled={Boolean(busy)}><RefreshCw size={16} /> Revisar conexión</button></div>{agentPairing.rePairing && <p className="mt-4 text-xs text-amber-200">El agente respondió, pero su secreto anterior ya no coincide. Vuelve a vincularlo para actualizar la conexión.</p>}</section>}
    <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><button className={`${mode === 'adb' ? primary : button}`} onClick={() => { setMode('adb'); setSelected('') }}><Smartphone size={16} /> ADB</button><button className={`${mode === 'fastboot' ? primary : button}`} onClick={() => { setMode('fastboot'); setSelected('') }}><Zap size={16} /> FASTBOOT</button></div><button className={button} onClick={refresh} disabled={!agent || Boolean(busy)}><RefreshCw size={15} className={busy === 'refresh' ? 'animate-spin' : ''} /> Buscar dispositivos</button></div><div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]"><label className="text-sm text-slate-300">Dispositivo activo<select className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100" value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">{currentList.length ? 'Selecciona un dispositivo' : mode === 'adb' ? 'Sin dispositivos ADB' : 'Sin dispositivos Fastboot'}</option>{currentList.map((item) => <option key={item.serial} value={item.serial}>{item.model || item.product || item.serial} — {item.serial} ({item.state})</option>)}</select></label><div className="flex items-end"><button className={`${primary} w-full`} onClick={loadInfo} disabled={!connected || Boolean(busy)}>{busy === 'info' ? <LoaderCircle size={16} className="animate-spin" /> : <Info size={16} />} Información completa</button></div></div></section>
    {mode === 'adb' && <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold"><Activity size={18} className="text-cyan-300" />{title}</h2><p className="mt-1 text-xs text-slate-500">Estado: <span className={currentDevice?.state === 'device' ? 'text-emerald-300' : 'text-amber-300'}>{currentDevice?.state || 'no device'}</span> · Serial: {value(selected)}</p></div><div className="flex flex-wrap gap-2"><button className={button} disabled={!connected || Boolean(busy)} onClick={() => loadInfo()}><RefreshCw size={15} /> Actualizar</button><button className={button} disabled={!connected || Boolean(busy)} onClick={() => call(`/devices/${selected}/reboot`, { command: 'reboot' })}><RotateCcw size={15} /> Reiniciar</button><button className={button} disabled={!connected || Boolean(busy)} onClick={() => call(`/devices/${selected}/recovery`, { command: 'recovery' })}>Recovery</button><button className={button} disabled={!connected || Boolean(busy)} onClick={() => call(`/devices/${selected}/bootloader`, { command: 'bootloader' })}>Bootloader</button><button className={button} disabled={!connected || Boolean(busy)} onClick={() => call(`/devices/${selected}/fastboot`, { command: 'fastboot' })}>Fastboot</button></div></div>{info && <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{facts.map(([label, item]) => <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-all text-sm text-slate-200">{value(item)}</p></div>)}</div>}{info && <div className="mt-4 grid gap-3 border-t border-slate-800 pt-4 md:grid-cols-[180px_180px_1fr_auto]"><select value={stage} onChange={(event) => setStage(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><option value="diagnostico">Diagnóstico inicial</option><option value="despues_reparacion">Después de reparación</option><option value="entrega">Entrega</option></select><input value={repairOrderId} onChange={(event) => setRepairOrderId(event.target.value)} placeholder="ID de orden (opcional)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><input value={customerId} onChange={(event) => setCustomerId(event.target.value)} placeholder="ID de cliente (opcional)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas técnicas" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><button className={primary} onClick={saveSnapshot} disabled={busy === 'snapshot'}><Download size={15} /> Guardar snapshot</button><button className={button} onClick={analyzeDevice} disabled={busy === 'ai'}>{busy === 'ai' ? <LoaderCircle size={15} className="animate-spin" /> : <Activity size={15} />} Analizar dispositivo</button></div>}</section>}
    {mode === 'fastboot' && <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold"><Zap size={18} className="text-amber-300" />FASTBOOT DEVICE</h2><p className="mt-1 text-xs text-slate-500">Serial: {value(selected)} · Las variables dependen del fabricante.</p></div><div className="flex flex-wrap gap-2"><button className={button} onClick={loadInfo} disabled={!connected || Boolean(busy)}><RefreshCw size={15} /> Consultar variables</button><button className={button} onClick={() => { if (window.confirm('¿Reiniciar el dispositivo al sistema?')) call(`/fastboot/${selected}/reboot`, { command: 'fastboot reboot', mode: 'fastboot' }) }} disabled={!connected || Boolean(busy)}>Reboot System</button><button className={button} onClick={() => { if (window.confirm('¿Reiniciar al bootloader?')) call(`/fastboot/${selected}/reboot-bootloader`, { command: 'fastboot reboot-bootloader', mode: 'fastboot' }) }} disabled={!connected || Boolean(busy)}>Reboot Bootloader</button></div></div>{fastbootInfo && <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[['Product', fastbootInfo.product], ['Serial', fastbootInfo.serial], ['Bootloader', fastbootInfo['version-bootloader']], ['Secure', fastbootInfo.secure], ['Unlocked', fastbootInfo.unlocked], ['Slot activo', fastbootInfo['current-slot']], ['Slot count', fastbootInfo['slot-count']]].map(([label, item]) => <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-all text-sm text-slate-200">{value(item)}</p></div>)}</div>}</section>}
    {agentDiagnostics && <section className={panel}><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-emerald-300" />Autodiagnóstico del agente</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[['ADB encontrado', agentDiagnostics.adb?.found ? 'Sí' : 'No'], ['Fastboot encontrado', agentDiagnostics.fastboot?.found ? 'Sí' : 'No'], ['ADB Server :5037', agentDiagnostics.adb?.server_5037 ? 'Disponible' : 'No disponible'], ['Plataforma preparada', agentDiagnostics.platform_tools_ready ? 'Sí' : 'No'], ['Versión ADB', agentDiagnostics.adb?.version], ['Versión Fastboot', agentDiagnostics.fastboot?.version], ['Agent', agentDiagnostics.agent?.version], ['Sistema', agentDiagnostics.agent?.platform]].map(([label, item]) => <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm text-slate-200">{value(item)}</p></div>)}</div></section>}
    {mode === 'adb' && <section className={panel}><h2 className="flex items-center gap-2 font-semibold"><Smartphone size={18} className="text-cyan-300" />Acciones ADB</h2><div className="mt-4 flex flex-wrap gap-2"><button className={button} onClick={() => call(`/devices/${selected}/screenshot`, { command: 'screenshot', body: { path: localPath } })} disabled={!connected || !localPath || Boolean(busy)}>Captura de pantalla</button><button className={button} onClick={() => call(`/devices/${selected}/install-apk`, { command: 'install-apk', body: { path: localPath } })} disabled={!connected || !localPath || Boolean(busy)}>Instalar APK</button><button className={button} onClick={() => call(`/devices/${selected}/push`, { command: 'push', body: { path: localPath, destination } })} disabled={!connected || !localPath || Boolean(busy)}>Enviar archivo</button><button className={button} onClick={() => call(`/devices/${selected}/pull`, { command: 'pull', body: { path: localPath, source: destination } })} disabled={!connected || !localPath || Boolean(busy)}>Descargar archivo</button><button className={button} onClick={() => call(`/devices/${selected}/packages`, { command: 'packages' })} disabled={!connected || Boolean(busy)}>Paquetes instalados</button><button className={button} onClick={() => call(`/devices/${selected}/processes`, { command: 'processes' })} disabled={!connected || Boolean(busy)}>Procesos</button><button className={button} onClick={() => call(`/devices/${selected}/battery`, { command: 'battery' })} disabled={!connected || Boolean(busy)}>Batería</button><button className={button} onClick={() => call(`/devices/${selected}/storage`, { command: 'storage' })} disabled={!connected || Boolean(busy)}>Almacenamiento</button><button className={button} onClick={() => call(`/devices/${selected}/properties`, { command: 'properties' })} disabled={!connected || Boolean(busy)}>Propiedades</button><button className={button} onClick={() => call(`/devices/${selected}/logs`, { command: 'logs' })} disabled={!connected || Boolean(busy)}>Logs</button></div><div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs text-slate-400">Archivo local autorizado<select value={localPath} onChange={(event) => setLocalPath(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"><option value="">Selecciona un archivo del agente</option>{localFiles.map((file) => <option key={file.path} value={file.path}>{file.name} ({Math.round(file.size / 1024)} KB)</option>)}</select></label><label className="text-xs text-slate-400">Ruta remota permitida<input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="/sdcard/Download/archivo" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" /></label></div><p className="mt-3 text-xs leading-5 text-slate-500">Las acciones de archivos solo usan la carpeta configurada del agente y rutas remotas /sdcard o /data/local/tmp.</p></section>}
    <section className={panel}><div className="flex items-center gap-2"><Terminal size={18} className="text-cyan-300" /><h2 className="font-semibold">Consola técnica autorizada</h2></div><div className="mt-4 flex flex-wrap gap-2"><select value={shellQuery} onChange={(event) => setShellQuery(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><option value="battery">Consultar batería</option><option value="properties">Consultar propiedades</option><option value="storage">Consultar almacenamiento</option><option value="processes">Consultar procesos</option><option value="uptime">Consultar tiempo encendido</option><option value="wifi">Consultar Wi‑Fi</option></select><button className={primary} onClick={() => call(`/devices/${selected}/shell`, { command: `shell ${shellQuery}`, body: { command: shellQuery } })} disabled={!connected || Boolean(busy)}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Terminal size={16} />} Ejecutar consulta</button></div><pre className="mt-4 max-h-64 overflow-auto rounded-xl border border-slate-800 bg-black/40 p-4 text-xs leading-5 text-emerald-200">{output || 'La salida real del dispositivo aparecerá aquí.'}</pre></section>
    <section className={panel}><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><MonitorDown size={18} className="text-slate-300" />Device Log</h2><span className="text-xs text-slate-500">{logs.length} eventos</span></div><div className="mt-3 max-h-48 overflow-auto rounded-xl border border-slate-800 bg-black/30 p-3 font-mono text-xs leading-6 text-slate-400">{logs.length ? logs.map((entry, index) => <p key={`${entry.at}-${index}`}><span className="text-slate-600">{new Date(entry.at).toLocaleTimeString()}</span> <span className={entry.level === 'error' ? 'text-red-300' : entry.level === 'warn' ? 'text-amber-300' : 'text-emerald-300'}>{entry.message}</span>{entry.serial ? ` · ${entry.serial}` : ''}</p>) : <p>Esperando eventos del agente…</p>}</div></section>
    {mode === 'fastboot' && fastbootInfo && <section className={panel}><h2 className="flex items-center gap-2 font-semibold"><Zap size={18} className="text-amber-300" />Acciones Fastboot seguras</h2><div className="mt-3 flex flex-wrap items-center gap-2"><select id="fastboot-slot" defaultValue="" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><option value="">Cambiar slot…</option><option value="a">Slot A</option><option value="b">Slot B</option></select><button className={button} onClick={() => { const slot = document.getElementById('fastboot-slot')?.value; if (slot && window.confirm(`¿Cambiar el slot activo a ${slot.toUpperCase()}? Confirma que el fabricante lo soporte.`)) call(`/fastboot/${selected}/set-active-slot`, { command: `fastboot set_active ${slot}`, mode: 'fastboot', body: { slot } }) }} disabled={!connected || Boolean(busy)}>Confirmar cambio de slot</button></div><details className="mt-3"><summary className="cursor-pointer text-xs text-slate-400">Variables fastboot disponibles</summary><pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-slate-300">{value(fastbootInfo.raw_variables)}</pre></details></section>}
    {aiResult && <section className={panel}><h2 className="flex items-center gap-2 font-semibold"><Activity size={18} className="text-cyan-300" />Conclusiones de IA</h2><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-black/30 p-4 text-sm leading-6 text-slate-300">{typeof aiResult === 'string' ? aiResult : JSON.stringify(aiResult, null, 2)}</pre><p className="mt-3 text-xs text-slate-500">La IA recibió exclusivamente datos obtenidos por ADB. Verifica sus conclusiones con el técnico.</p></section>}
    {mode === 'adb' && currentDevice?.state === 'unauthorized' && <section className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Autoriza la depuración USB desde el teléfono.</p><p className="mt-1 text-amber-200/80">No se ejecutarán acciones hasta que ADB reporte el estado <code>device</code>.</p></div></section>}
    {mode === 'adb' && currentDevice?.state === 'offline' && <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">ADB reporta el dispositivo como offline. Revisa el cable, los drivers y vuelve a conectar el teléfono.</section>}
  </div>
}
