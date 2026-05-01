import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }

interface S8State {
  running: boolean
  asil_status: string
  qm_status: string
  qm_version: string
  asil_latency: number[]
  qm_latency: number[]
  qm_downtime_ms: number
  update_in_progress: boolean
  asil_uptime_s: number
  log: string[]
  error: string | null
}

const INIT: S8State = {
  running: false, asil_status: 'stopped', qm_status: 'stopped',
  qm_version: 'v1.0.0', asil_latency: [], qm_latency: [],
  qm_downtime_ms: 0, update_in_progress: false, asil_uptime_s: 0,
  log: [], error: null,
}

function statusColor(s: string) {
  if (s === 'healthy') return '#10b981'
  if (s === 'updating') return '#f59e0b'
  if (s === 'stopped') return '#444'
  return '#ef4444'
}

function fmtUptime(s: number) {
  const m = Math.floor(s / 60), sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export default function FeatureOnDemand({ lastMsg, send }: Props) {
  const [st, setSt] = useState<S8State>(INIT)

  useEffect(() => {
    if (!lastMsg) return
    if (lastMsg.type === 'init' && lastMsg.scenario8) setSt(lastMsg.scenario8 as S8State)
    if (lastMsg.type === 's8_state') setSt(lastMsg as unknown as S8State)
  }, [lastMsg])

  const asilData = st.asil_latency.map((v, i) => ({ i, ms: v }))
  const qmData = st.qm_latency.map((v, i) => ({ i, ms: v }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ee0000', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Scenario 8 — Feature-on-Demand
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Per-container OTA: update IVI without touching ASIL-B</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            ASIL-B keeps serving requests throughout the entire QM container swap
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!st.running
            ? <button className="btn-primary" onClick={() => send('/scenario8/start')}>Start Scenario</button>
            : <button className="btn-ghost" onClick={() => send('/scenario8/stop')}>Stop</button>
          }
        </div>
      </div>

      {st.error && (
        <div style={{ background: '#1f0d0d', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#fca5a5' }}>
          ⚠ {st.error}
        </div>
      )}

      {/* Two container cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ASIL-B card */}
        <div style={{
          background: '#111', border: `1px solid ${st.asil_status === 'healthy' ? '#7f1d1d' : '#333'}`,
          borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{ background: '#1a0505', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>ASIL-B · Safety Critical</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ee0000' }}>ADAS Safety Controller</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                background: `${statusColor(st.asil_status)}22`, color: statusColor(st.asil_status),
              }}>
                {st.asil_status.toUpperCase()}
              </div>
              {st.asil_status === 'healthy' && (
                <div style={{ fontSize: 10, color: '#10b981' }}>uptime {fmtUptime(st.asil_uptime_s)}</div>
              )}
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 8 }}>Response latency (ms) — must never spike during QM update</div>
            <div style={{ height: 120 }}>
              <ResponsiveContainer>
                <LineChart data={asilData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis dataKey="i" hide />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#555' }} />
                  <Tooltip formatter={(v: number) => [`${v} ms`, 'Latency']} contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }} />
                  <ReferenceLine y={10} stroke="#dc2626" strokeDasharray="4 2" label={{ value: '10ms SLA', fill: '#dc2626', fontSize: 9 }} />
                  <Line type="monotone" dataKey="ms" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 11, color: '#10b981', marginTop: 8, fontWeight: 600 }}>
              {st.asil_latency.length > 0 && `Last: ${st.asil_latency[st.asil_latency.length - 1]} ms`}
            </div>
          </div>
        </div>

        {/* QM card */}
        <div style={{
          background: '#111',
          border: `1px solid ${st.update_in_progress ? '#f59e0b66' : st.qm_status === 'healthy' ? '#333' : '#333'}`,
          borderRadius: 10, overflow: 'hidden',
          transition: 'border-color 0.3s',
        }}>
          <div style={{ background: st.update_in_progress ? '#1c1300' : '#0d0d0d', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.3s' }}>
            <div>
              <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>QM · Non-Safety</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed' }}>IVI Media Player</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                background: st.update_in_progress ? '#f59e0b22' : `${statusColor(st.qm_status)}22`,
                color: st.update_in_progress ? '#f59e0b' : statusColor(st.qm_status),
              }}>
                {st.update_in_progress ? 'UPDATING…' : st.qm_status.toUpperCase()}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: st.qm_version === 'v2.0.0' ? '#10b981' : '#888',
              }}>
                {st.qm_version}
              </div>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            {st.update_in_progress ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, gap: 12 }}>
                <div style={{ fontSize: 28 }}>📦</div>
                <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, animation: 'pulse 1s infinite' }}>
                  Swapping container…
                </div>
                <div style={{ fontSize: 11, color: '#666' }}>v1.0.0 → v2.0.0</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 8 }}>Response latency (ms)</div>
                <div style={{ height: 120 }}>
                  <ResponsiveContainer>
                    <LineChart data={qmData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="i" hide />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#555' }} />
                      <Tooltip formatter={(v: number) => [`${v} ms`, 'Latency']} contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }} />
                      <Line type="monotone" dataKey="ms" stroke="#7c3aed" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {st.qm_downtime_ms > 0 && !st.update_in_progress && (
              <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 8, fontWeight: 600 }}>
                Last swap window: {st.qm_downtime_ms} ms
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Update button + comparison banner */}
      {st.running && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
          <button
            className="btn-primary"
            disabled={st.update_in_progress || st.qm_version === 'v2.0.0'}
            onClick={() => send('/scenario8/update')}
            style={{ flex: '0 0 auto', padding: '12px 28px', fontSize: 14 }}
          >
            {st.update_in_progress ? '⏳ Updating…' : st.qm_version === 'v2.0.0' ? '✅ Already on v2.0.0' : '🚀 Push IVI Update v2.0.0'}
          </button>

          {st.qm_version === 'v2.0.0' && !st.update_in_progress && (
            <div style={{
              flex: 1, background: '#052e16', border: '1px solid #166534', borderRadius: 8,
              padding: '12px 16px', display: 'flex', gap: 32, alignItems: 'center',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#4ade80' }}>{fmtUptime(st.asil_uptime_s)}</div>
                <div style={{ fontSize: 10, color: '#4ade80' }}>ASIL-B uptime</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{st.qm_downtime_ms} ms</div>
                <div style={{ fontSize: 10, color: '#f59e0b' }}>QM swap window</div>
              </div>
              <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>
                🛡 Safety function never interrupted — this is Feature-on-Demand
              </div>
            </div>
          )}
        </div>
      )}

      {/* Log */}
      {st.log.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Event log</span></div>
          <div className="card-body">
            <div className="log-box">
              {st.log.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
