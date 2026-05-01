import { useState, useEffect, useRef, useCallback } from 'react'
import MixedCriticality from './components/MixedCriticality'
import BlueChi from './components/BlueChi'
import OTAUpdate from './components/OTAUpdate'
import MemoryIsolation from './components/MemoryIsolation'
import StartupChain from './components/StartupChain'
import Greenboot from './components/Greenboot'
import TemporalIsolation from './components/TemporalIsolation'
import FeatureOnDemand from './components/FeatureOnDemand'
import SpatialIsolation from './components/SpatialIsolation'
import IPCDemo from './components/IPCDemo'
import ArchitectureEvolution from './components/ArchitectureEvolution'
import CombinedIsolation from './components/CombinedIsolation'
import './App.css'

export type WsMessage = { type: string; [key: string]: unknown }

const TABS = [
  { id: 'arch',  label: 'Why RHIVOS?',          sub: '① Overview',      group: 'intro' },
  { id: 'iso',   label: 'Safety Isolation',     sub: '② ASIL-B proof',  group: 'isolation' },
  { id: 'bc',    label: 'Fleet Orchestration',  sub: '③ Self-healing',  group: 'orchestration' },
  { id: 'ota',   label: 'OTA Updates',          sub: '④ At scale',      group: 'updates' },
  { id: 'fod',   label: 'Feature-on-Demand',   sub: '⑤ Revenue',       group: 'updates' },
  { id: 'green', label: 'Update Safety Net',    sub: '⑥ Greenboot',     group: 'updates' },
]

const GROUP_COLORS: Record<string, string> = {
  intro: '#6b7280',
  isolation: '#ee0000',
  orchestration: '#3b82f6',
  updates: '#10b981',
}

export default function App() {
  const [tab, setTab]         = useState('arch')
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
            <span className="logo-text">RHIVOS Demo</span>
          </div>
          <span className="header-sub">Red Hat In-Vehicle OS · Real containers · Real cgroups · Real recovery</span>
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

      <nav className="tab-bar" style={{ flexWrap: 'wrap', rowGap: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            style={tab === t.id ? { borderBottomColor: GROUP_COLORS[t.group] } : {}}
          >
            <span className="tab-sub" style={{ color: GROUP_COLORS[t.group], opacity: tab === t.id ? 1 : 0.5 }}>{t.sub}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* Technology stack strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        background: '#0a0a0a', borderBottom: '1px solid #1a1a1a',
        padding: '0 24px', fontSize: 10, overflowX: 'auto', whiteSpace: 'nowrap',
      }}>
        <span style={{ color: '#333', marginRight: 12, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
          Tech stack:
        </span>
        {[
          { label: 'AutoSD',      desc: 'Upstream open-source OS',       color: '#6b7280', layer: 'OS' },
          { label: 'RHIVOS',      desc: 'ASIL-B certified product',       color: '#ee0000', layer: 'OS' },
          { label: 'cgroups v2',  desc: 'CPU / memory isolation',        color: '#10b981', layer: 'Kernel' },
          { label: 'Podman',      desc: 'Rootless containers',           color: '#8b5cf6', layer: 'Runtime' },
          { label: 'BlueChi',     desc: 'Multi-chip orchestration',      color: '#3b82f6', layer: 'Orchestration' },
          { label: 'rpm-ostree',  desc: 'Atomic A/B OTA updates',       color: '#f59e0b', layer: 'Updates' },
          { label: 'Greenboot',   desc: 'Health-gate + auto rollback',   color: '#22c55e', layer: 'Updates' },
        ].map((item, i) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <span style={{ padding: '0 6px', color: '#222' }}>·</span>}
            <div style={{ padding: '5px 0', display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: item.color }}>{item.label}</span>
              <span style={{ color: '#333' }}>{item.desc}</span>
            </div>
          </div>
        ))}
      </div>

      <main className="app-main">
        {tab === 'arch'    && <ArchitectureEvolution />}
        {tab === 'iso'     && <CombinedIsolation  lastMsg={lastMsg} send={send} />}
        {tab === 'mc'      && <MixedCriticality   lastMsg={lastMsg} send={send} />}
        {tab === 'bc'      && <BlueChi             lastMsg={lastMsg} send={send} />}
        {tab === 'ota'     && <OTAUpdate          lastMsg={lastMsg} send={send} />}
        {tab === 'mem'     && <MemoryIsolation    lastMsg={lastMsg} send={send} />}
        {tab === 'boot'    && <StartupChain       lastMsg={lastMsg} send={send} />}
        {tab === 'green'   && <Greenboot          lastMsg={lastMsg} send={send} />}
        {tab === 'temp'    && <TemporalIsolation  lastMsg={lastMsg} send={send} />}
        {tab === 'fod'     && <FeatureOnDemand    lastMsg={lastMsg} send={send} />}
        {tab === 'spatial' && <SpatialIsolation   lastMsg={lastMsg} send={send} />}
        {tab === 'ipc'     && <IPCDemo            lastMsg={lastMsg} send={send} />}
      </main>
    </div>
  )
}
