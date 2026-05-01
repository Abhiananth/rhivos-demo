import { useState, useEffect, useRef, useCallback } from 'react'
import MixedCriticality from './components/MixedCriticality'
import BlueChi from './components/BlueChi'
import OTAUpdate from './components/OTAUpdate'
import './App.css'

export type WsMessage = { type: string; [key: string]: unknown }

const TABS = [
  { id: 'mc',  label: 'Mixed Criticality',    sub: 'Scenario 1' },
  { id: 'bc',  label: 'BlueChi Orchestration', sub: 'Scenario 2' },
  { id: 'ota', label: 'OTA Update',            sub: 'Scenario 3' },
]

export default function App() {
  const [tab, setTab]         = useState('mc')
  const [ready, setReady]     = useState(false)
  const [building, setBuilding] = useState(false)
  const [lastMsg, setLastMsg] = useState<WsMessage | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const send = useCallback((path: string, method = 'POST') => {
    fetch(`/api${path}`, { method }).catch(console.error)
  }, [])

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`)
    wsRef.current = ws
    ws.onopen    = () => setReady(true)
    ws.onclose   = () => setReady(false)
    ws.onmessage = e => {
      try { setLastMsg(JSON.parse(e.data)) } catch {}
    }
    return () => ws.close()
  }, [])

  const handleBuild = () => {
    setBuilding(true)
    send('/build')
  }

  useEffect(() => {
    if (lastMsg?.type === 'build_complete') setBuilding(false)
  }, [lastMsg])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-dot" />
            <span className="logo-text">Automotive Linux Demo</span>
          </div>
          <span className="header-sub">Real containers · Real cgroups · Real recovery</span>
        </div>
        <div className="header-right">
          <div className={`ws-status ${ready ? 'connected' : 'disconnected'}`}>
            <span className="ws-dot" />
            {ready ? 'Connected' : 'Disconnected'}
          </div>
          <button
            className={building ? 'btn-ghost' : 'btn-primary'}
            onClick={handleBuild}
            disabled={building || !ready}
          >
            {building ? 'Building images…' : 'Build container images'}
          </button>
        </div>
      </header>

      <nav className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-sub">{t.sub}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="app-main">
        {tab === 'mc'  && <MixedCriticality lastMsg={lastMsg} send={send} />}
        {tab === 'bc'  && <BlueChi          lastMsg={lastMsg} send={send} />}
        {tab === 'ota' && <OTAUpdate        lastMsg={lastMsg} send={send} />}
      </main>
    </div>
  )
}
