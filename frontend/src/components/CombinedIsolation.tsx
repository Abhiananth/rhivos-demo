import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }

interface SIsoState {
  running: boolean
  asil_status: string
  attacker_status: string
  asil_latency: number[]
  asil_uptime_s: number
  asil_deadline_misses: number
  cpu_attack: boolean
  mem_attack: boolean
  temporal_attack: boolean
  spatial_probe_result: 'blocked' | 'reachable' | 'running' | null
  spatial_probe_ip: string | null
  attacker_mem_mb: number
  log: string[]
  error: string | null
}

const INIT: SIsoState = {
  running: false, asil_status: 'stopped', attacker_status: 'stopped',
  asil_latency: [], asil_uptime_s: 0, asil_deadline_misses: 0,
  cpu_attack: false, mem_attack: false, temporal_attack: false,
  spatial_probe_result: null, spatial_probe_ip: null,
  attacker_mem_mb: 0, log: [], error: null,
}

function fmtUptime(s: number) {
  const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

function AttackCard({
  title, icon, description, active, statusLabel,
  onStart, onStop, disabled, children,
}: {
  title: string; icon: string; description: string
  active: boolean; statusLabel: string
  onStart: () => void; onStop: () => void
  disabled: boolean; children?: React.ReactNode
}) {
  return (
    <div style={{
      background: active ? '#1a0a0a' : '#0f0f0f',
      border: `1px solid ${active ? '#dc2626' : '#222'}`,
      borderRadius: 10, overflow: 'hidden',
      transition: 'all 0.3s',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${active ? '#3f0000' : '#1a1a1a'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{title}</div>
            <div style={{ fontSize: 10, color: '#666' }}>{description}</div>
          </div>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
          background: active ? '#dc262622' : '#0d0d0d',
          color: active ? '#ef4444' : '#555',
          animation: active ? 'pulse 1.2s infinite' : 'none',
        }}>
          {statusLabel}
        </div>
      </div>
      <div style={{ padding: 14 }}>
        {children}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          {!active
            ? <button className="btn-danger" disabled={disabled} onClick={onStart} style={{ fontSize: 11, padding: '5px 12px' }}>
                Launch attack
              </button>
            : <button className="btn-ghost" onClick={onStop} style={{ fontSize: 11, padding: '5px 12px' }}>
                Stop
              </button>
          }
        </div>
      </div>
    </div>
  )
}

function MemBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(value / max * 100, 100)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666', marginBottom: 4 }}>
        <span>Memory usage</span>
        <span style={{ color: pct > 80 ? '#ef4444' : '#888' }}>{Math.round(value)} / {max} MB</span>
      </div>
      <div style={{ height: 8, background: '#1a1a1a', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 4,
          background: pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : color,
          transition: 'width 0.5s, background 0.3s',
        }} />
      </div>
    </div>
  )
}

export default function CombinedIsolation({ lastMsg, send }: Props) {
  const [st, setSt] = useState<SIsoState>(INIT)

  useEffect(() => {
    if (!lastMsg) return
    if (lastMsg.type === 'init' && lastMsg.siso) setSt(lastMsg.siso as SIsoState)
    if (lastMsg.type === 'siso_state') setSt(lastMsg as unknown as SIsoState)
  }, [lastMsg])

  const anyAttack = st.cpu_attack || st.mem_attack || st.temporal_attack
  const allAttack = st.cpu_attack && st.mem_attack && st.temporal_attack
  const latencyData = st.asil_latency.map((v, i) => ({ i, ms: Math.min(v, 50) }))
  const lastMs = st.asil_latency[st.asil_latency.length - 1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Hero header ────────────────────────────────────────────────────── */}
      <div style={{
        background: anyAttack ? '#1a0505' : '#0f0f0f',
        border: `1px solid ${anyAttack ? '#7f1d1d' : '#222'}`,
        borderRadius: 12, padding: '20px 24px',
        transition: 'all 0.4s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>

          {/* Left: title + description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ee0000', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Isolation Suite
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
              Attack ASIL-B from every angle.
            </div>
            <div style={{ fontSize: 12, color: '#777' }}>
              CPU, memory, temporal, and network isolation — all four enforced by the Linux kernel simultaneously.
            </div>
          </div>

          {/* Right: status dials */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: st.asil_deadline_misses === 0 && st.running ? '#10b981' : '#ef4444' }}>
                {st.asil_deadline_misses}
              </div>
              <div style={{ fontSize: 10, color: '#555' }}>safety deadline<br />misses</div>
            </div>
            <div style={{ width: 1, height: 40, background: '#222' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>
                {st.running ? fmtUptime(st.asil_uptime_s) : '—'}
              </div>
              <div style={{ fontSize: 10, color: '#555' }}>ASIL-B<br />uptime</div>
            </div>
            <div style={{ width: 1, height: 40, background: '#222' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: anyAttack ? '#ef4444' : '#555' }}>
                {anyAttack ? [st.cpu_attack, st.mem_attack, st.temporal_attack].filter(Boolean).length : 0} / 4
              </div>
              <div style={{ fontSize: 10, color: '#555' }}>attacks<br />active</div>
            </div>
          </div>
        </div>

        {/* ASIL-B status strip */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{
              padding: '6px 16px', borderRadius: 6, fontWeight: 800, fontSize: 13,
              background: st.asil_status === 'healthy' ? '#052e16' : '#1f0d0d',
              color: st.asil_status === 'healthy' ? '#4ade80' : '#f87171',
              border: `1px solid ${st.asil_status === 'healthy' ? '#166534' : '#7f1d1d'}`,
            }}>
              {st.asil_status === 'healthy' ? '🛡 ASIL-B HEALTHY' : st.asil_status === 'stopped' ? '— STOPPED' : '⚠ ' + st.asil_status.toUpperCase()}
            </div>
            {anyAttack && st.asil_status === 'healthy' && st.asil_deadline_misses === 0 && (
              <div style={{
                padding: '6px 16px', borderRadius: 6, fontWeight: 800, fontSize: 13,
                background: '#052e16', color: '#4ade80', border: '1px solid #166534',
              }}>
                ✅ ZERO IMPACT
              </div>
            )}
            {anyAttack && (
              <div style={{
                padding: '6px 16px', borderRadius: 6, fontWeight: 700, fontSize: 12,
                background: '#450a0a', color: '#fca5a5', border: '1px solid #7f1d1d',
                animation: 'pulse 1s infinite',
              }}>
                🚨 UNDER ATTACK
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 8 }}>
            {!st.running
              ? <button className="btn-primary" onClick={() => send('/iso/start')}>Start Scenario</button>
              : <>
                  {!allAttack
                    ? <button className="btn-danger" disabled={!st.running}
                        onClick={() => send('/iso/attack/full')}
                        style={{ fontWeight: 800 }}>
                        🚨 Full Attack
                      </button>
                    : <button className="btn-ghost" onClick={() => send('/iso/attack/stop')}>
                        ✋ Stop All Attacks
                      </button>
                  }
                  <button className="btn-ghost" onClick={() => send('/iso/stop')}>Stop Scenario</button>
                </>
            }
          </div>
        </div>
      </div>

      {st.error && (
        <div style={{ background: '#1f0d0d', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#fca5a5' }}>
          ⚠ {st.error}
        </div>
      )}

      {/* ── ASIL-B latency chart ─────────────────────────────────────────────── */}
      <div className="card" style={{ borderColor: anyAttack ? '#7f1d1d44' : undefined }}>
        <div className="card-header">
          <span className="card-title">ASIL-B response latency — live</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#555' }}>
            10ms safety deadline · must never breach it
          </span>
          {lastMs != null && (
            <span style={{ marginLeft: 16, fontSize: 13, fontWeight: 700, color: lastMs < 10 ? '#10b981' : '#ef4444' }}>
              {lastMs.toFixed(1)} ms
            </span>
          )}
        </div>
        <div className="card-body">
          <div style={{ height: 160 }}>
            {latencyData.length === 0
              ? <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 12 }}>
                  Start the scenario — latency data will appear here
                </div>
              : <ResponsiveContainer>
                  <LineChart data={latencyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                    <XAxis dataKey="i" hide />
                    <YAxis domain={[0, 30]} tick={{ fontSize: 10, fill: '#555' }} />
                    <Tooltip
                      formatter={(v: number) => [`${v.toFixed(2)} ms`, 'ASIL-B latency']}
                      contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }}
                    />
                    <ReferenceLine y={10} stroke="#ef4444" strokeDasharray="4 2"
                      label={{ value: '10ms deadline', fill: '#ef4444', fontSize: 9 }} />
                    <Line type="monotone" dataKey="ms" stroke="#10b981" strokeWidth={2.5}
                      dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
            }
          </div>
        </div>
      </div>

      {/* ── 4 attack cards ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* CPU Attack */}
        <AttackCard
          title="CPU Isolation" icon="⚡"
          description="cgroups v2 CPU quota enforcement"
          active={st.cpu_attack}
          statusLabel={st.cpu_attack ? 'BURNING CPU' : 'IDLE'}
          onStart={() => send('/iso/attack/cpu/start')}
          onStop={() => send('/iso/attack/cpu/stop')}
          disabled={!st.running}
        >
          <div style={{ fontSize: 11, color: '#666', lineHeight: 1.7 }}>
            ci-attacker burns CPU as fast as it can.<br />
            <span style={{ color: '#888' }}>ci-asil has</span>{' '}
            <span style={{ color: '#ee0000', fontWeight: 700 }}>--cpus 0.4</span>
            <span style={{ color: '#888' }}> — kernel guarantees its 40% slice.</span>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, background: '#0d0d0d', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>40%</div>
              <div style={{ fontSize: 9, color: '#555' }}>ASIL-B reserved</div>
            </div>
            <div style={{ flex: 1, background: '#0d0d0d', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: st.cpu_attack ? '#ef4444' : '#555' }}>
                {st.cpu_attack ? '↑↑↑' : '—'}
              </div>
              <div style={{ fontSize: 9, color: '#555' }}>attacker load</div>
            </div>
          </div>
        </AttackCard>

        {/* Memory Attack */}
        <AttackCard
          title="Memory Isolation" icon="💾"
          description="cgroups v2 memory ceiling + OOM kill"
          active={st.mem_attack}
          statusLabel={st.attacker_status === 'oom-killed' ? 'OOM-KILLED' : st.mem_attack ? 'LEAKING' : 'IDLE'}
          onStart={() => send('/iso/attack/mem/start')}
          onStop={() => send('/iso/attack/mem/stop')}
          disabled={!st.running}
        >
          <div style={{ fontSize: 11, color: '#666', lineHeight: 1.7, marginBottom: 10 }}>
            ci-attacker leaks 8 MB/s until OOM-killed at{' '}
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>160 MB</span>.{' '}
            <span style={{ color: '#888' }}>ci-asil memory: unchanged.</span>
          </div>
          <MemBar value={st.attacker_mem_mb} max={160} color="#f59e0b" />
          {st.attacker_status === 'oom-killed' && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#4ade80', fontWeight: 700 }}>
              💥 Attacker OOM-killed · ci-asil unaffected ✅
            </div>
          )}
        </AttackCard>

        {/* Temporal Attack */}
        <AttackCard
          title="Temporal Isolation" icon="⏱"
          description="PREEMPT_RT · scheduling latency guarantee"
          active={st.temporal_attack}
          statusLabel={st.temporal_attack ? 'FLOODING' : 'IDLE'}
          onStart={() => send('/iso/attack/temporal/start')}
          onStop={() => send('/iso/attack/temporal/stop')}
          disabled={!st.running}
        >
          <div style={{ fontSize: 11, color: '#666', lineHeight: 1.7 }}>
            Concurrent request flood creates scheduling noise.<br />
            <span style={{ color: '#888' }}>ASIL-B latency stays</span>{' '}
            <span style={{ color: '#10b981', fontWeight: 700 }}>{'< 10ms'}</span>
            <span style={{ color: '#888' }}> — deterministic scheduling.</span>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, background: '#0d0d0d', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>
                {lastMs != null ? `${lastMs.toFixed(1)}ms` : '—'}
              </div>
              <div style={{ fontSize: 9, color: '#555' }}>ASIL-B latency</div>
            </div>
            <div style={{ flex: 1, background: '#0d0d0d', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: st.temporal_attack ? '#f59e0b' : '#555' }}>
                {st.temporal_attack ? '8×/50ms' : '—'}
              </div>
              <div style={{ fontSize: 9, color: '#555' }}>flood rate</div>
            </div>
          </div>
        </AttackCard>

        {/* Spatial Attack */}
        <AttackCard
          title="Spatial Isolation" icon="🌐"
          description="Linux network namespaces"
          active={st.spatial_probe_result === 'running'}
          statusLabel={
            st.spatial_probe_result === 'blocked' ? 'BLOCKED ✅' :
            st.spatial_probe_result === 'reachable' ? 'REACHABLE ⚠' :
            st.spatial_probe_result === 'running' ? 'PROBING…' : 'NOT PROBED'
          }
          onStart={() => send('/iso/probe/spatial')}
          onStop={() => {}}
          disabled={!st.running}
        >
          <div style={{ fontSize: 11, color: '#666', lineHeight: 1.7, marginBottom: 8 }}>
            ci-attacker tries to reach ci-asil's private IP on{' '}
            <span style={{ color: '#3b82f6', fontWeight: 700 }}>ci-isolated</span> network.<br />
            <span style={{ color: '#888' }}>Different namespaces = no route = blocked.</span>
          </div>
          {st.spatial_probe_result === 'blocked' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, background: '#1f0d0d', border: '1px solid #5c1a1a', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>✗ Direct IP</div>
                <div style={{ fontSize: 9, color: '#666' }}>{st.spatial_probe_ip || 'unknown'}</div>
              </div>
              <div style={{ flex: 1, background: '#052e16', border: '1px solid #166534', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80' }}>✓ Port :8901</div>
                <div style={{ fontSize: 9, color: '#555' }}>host channel</div>
              </div>
            </div>
          )}
        </AttackCard>
      </div>

      {/* ── Event log ────────────────────────────────────────────────────────── */}
      {st.log.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Isolation event log</span>
          </div>
          <div className="card-body">
            <div className="log-box">
              {st.log.map((l, i) => (
                <p key={i} style={{
                  color: l.includes('✅') || l.includes('ZERO') ? '#4ade80'
                       : l.includes('🚨') || l.includes('ATTACK') || l.includes('BLOCKED')
                         ? '#fca5a5' : undefined,
                }}>
                  {l}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
