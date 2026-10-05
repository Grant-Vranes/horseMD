// Watches the HorseMD main-process inspector; when the main process pins CPU,
// pauses V8 and dumps the JS call stack. Usage: node scripts/diag-freeze-stack.mjs
import { spawn, execSync } from 'node:child_process'

const PORT = 9339
const OUT = '/tmp/hmd-freeze-stack.log'
let dumped = new Set()

function cpuOf(pid) {
  try { return parseFloat(execSync(`ps -p ${pid} -o %cpu=`).toString().trim()) } catch { return 0 }
}

function mainPid() {
  try { return execSync('pgrep -x HorseMD | head -1').toString().trim() } catch { return '' }
}

async function dumpStack(pid) {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
  const t = targets.find((x) => x.type === 'node')
  if (!t) return console.error('no inspector target')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  await new Promise((r) => { ws.onopen = r })
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  await send('Debugger.enable')
  const paused = new Promise((res) => {
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.method === 'Debugger.paused') res(m.params)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    }
  })
  send('Debugger.pause')
  const params = await Promise.race([paused, new Promise((r) => setTimeout(() => r(null), 5000))])
  if (!params) { console.error('pause timed out'); ws.close(); return }
  const lines = [`===== freeze stack for pid ${pid} at ${new Date().toISOString()} =====`]
  for (const frame of params.callFrames.slice(0, 25)) {
    const f = frame.functionName || '(anonymous)'
    const loc = frame.location ? ` ${frame.location.scriptId}:${frame.location.lineNumber}` : ''
    lines.push(`${f}${loc}`)
  }
  const fs = await import('node:fs/promises')
  await fs.appendFile(OUT, lines.join('\n') + '\n')
  console.log(lines.join('\n'))
  await send('Debugger.resume').catch(() => {})
  ws.close()
}

console.log('inspector stack watcher running...')
while (true) {
  const pid = mainPid()
  if (pid && !dumped.has(pid) && cpuOf(pid) > 60) {
    console.log(`cpu spike on ${pid}, dumping stack`)
    dumped.add(pid)
    await dumpStack(pid).catch((e) => console.error('dump failed:', e.message))
  }
  await new Promise((r) => setTimeout(r, 1000))
}
