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
  { id: 'arch',   label: 'Architecture Evolution',  sub: 'Overview',    group: 'intro' },
  { id: 'iso',    label: 'Isolation Suite',          sub: 'Combined',    group: 'isolation' },
  { id: 'bc',     label: 'BlueChi Orchestration',   sub: 'Scenario 2',  group: 'orchestration' },
  { id: 'boot',   label: 'Startup Dependencies',    sub: 'Scenario 5',  group: 'orchestration' },
  { id: 'ipc',    label: 'Controlled IPC',          sub: 'Scenario 10', group: 'orchestration' },
  { id: 'ota',    label: 'OS OTA Update',           sub: 'Scenario 3',  group: 'updates' },
  { id: 'fod',    label: 'Feature-on-Demand',       sub: 'Scenario 8',  group: 'updates' },
  { id: 'green',  label: 'Greenboot Health Gate',   sub: 'Scenario 6',  group: 'updates' },
  // Individual isolation tabs kept for deep-dives
  { id: 'mc',     label: 'CPU Isolation ↗',         sub: 'Deep-dive',   group: 'isolation' },
  { id: 'mem',    label: 'Memory Isolation ↗',      sub: 'Deep-dive',   group: 'isolation' },
  { id: 'temp',   label: 'Temporal ↗',              sub: 'Deep-dive',   group: 'isolation' },
  { id: 'spatial',label: 'Spatial ↗',               sub: 'Deep-dive',   group: 'isolation' },
]

const GROUP_COLORS: Record<string, string> = {
  intro: '#6b7280',
  isolation: '#ee0000',
  orchestration: '#3b82f6',
  updates: '#10b981',
}

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

      {/* AutoSD / RHIVOS stack context strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        background: '#0d0d0d', borderBottom: '1px solid #1e1e1e',
        padding: '0 24px', fontSize: 11, color: '#555', overflowX: 'auto',
        whiteSpace: 'nowrap'
      }}>
        {[
          { label: 'AutoSD', desc: 'Open-source upstream', color: '#6b7280' },
          { label: 'RHIVOS', desc: 'ASIL-B certified OS', color: '#ee0000' },
          { label: 'BlueChi', desc: 'Multi-chip orchestration', color: '#3b82f6' },
          { label: 'cgroups v2', desc: 'Kernel isolation', color: '#10b981' },
          { label: 'rpm-ostree', desc: 'Atomic OTA updates', color: '#f59e0b' },
        ].map((item, i) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <span style={{ padding: '0 8px', color: '#2a2a2a' }}>→</span>}
            <div style={{ padding: '6px 0', display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontWeight: 700, color: item.color, fontSize: 10 }}>{item.label}</span>
              <span style={{ color: '#444', fontSize: 10 }}>{item.desc}</span>
            </div>
          </div>
        ))}
        <span style={{ marginLeft: 'auto', color: '#333', fontSize: 10 }}>AutoSD is the open-source upstream · RHIVOS is the ASIL-B certified product built from it</span>
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
