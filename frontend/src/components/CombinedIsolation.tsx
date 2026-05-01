import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
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
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

/** Central isolation diagram — always visible */
function IsolationDiagram({ st }: { st: SIsoState }) {
  const attacks = [
    {
      label: 'CPU Attack',
      sublabel: 'cgroups v2 CPU quota',
      icon: '⚡',
      active: st.cpu_attack,
      result: st.cpu_attack ? 'THROTTLED' : null,
      color: '#f59e0b',
      pos: 'top',
    },
    {
      label: 'Memory Attack',
      sublabel: 'cgroups v2 OOM kill',
      icon: '💾',
      active: st.mem_attack,
      result: st.attacker_status === 'oom-killed' ? 'OOM KILLED' : st.mem_attack ? 'LEAKING' : null,
      color: '#8b5cf6',
      pos: 'right',
    },
    {
      label: 'Temporal Attack',
      sublabel: 'scheduling flood',
      icon: '⏱',
      active: st.temporal_attack,
      result: st.temporal_attack ? 'FLOODING' : null,
      color: '#3b82f6',
      pos: 'bottom',
    },
    {
      label: 'Network Probe',
      sublabel: 'Linux namespaces',
      icon: '🌐',
      active: st.spatial_probe_result === 'blocked' || st.spatial_probe_result === 'running',
      result: st.spatial_probe_result === 'blocked' ? 'BLOCKED' : st.spatial_probe_result === 'running' ? 'PROBING…' : null,
      color: '#10b981',
      pos: 'left',
    },
  ]

  const anyAttack = st.cpu_attack || st.mem_attack || st.temporal_attack

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0' }}>
      {/* Grid: top row, middle row, bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px 80px 160px 80px 160px', gridTemplateRows: '80px 120px 80px', gap: 0, alignItems: 'center', justifyItems: 'center' }}>

        {/* Row 1: top attacker (cpu) — spans middle col */}
        <div /> {/* col 1 empty */}
        {/* col 2: top arrow */}
        <div style={{ gridColumn: 3, gridRow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <AttackBubble a={attacks[0]} />
          <Arrow dir="down" active={attacks[0].active} color={attacks[0].color} />
        </div>
        <div /> {/* col 4 */}
        <div /> {/* col 5 */}

        {/* Row 2: left attacker, left arrow, ASIL-B center, right arrow, right attacker */}
        {/* Left: Temporal */}
        <div style={{ gridColumn: 1, gridRow: 2 }}>
          <AttackBubble a={attacks[2]} />
        </div>
        <div style={{ gridColumn: 2, gridRow: 2 }}>
          <Arrow dir="right" active={attacks[2].active} color={attacks[2].color} />
        </div>

        {/* Center: ASIL-B */}
        <div style={{ gridColumn: 3, gridRow: 2 }}>
          <div style={{
            width: 120, height: 120, borderRadius: '50%',
            background: anyAttack && st.running && st.asil_deadline_misses === 0
              ? 'radial-gradient(circle, #052e16, #0d0d0d)'
              : st.running ? 'radial-gradient(circle, #052e16, #0d0d0d)' : '#111',
            border: `3px solid ${st.running && st.asil_status === 'healthy' ? '#10b981' : '#333'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxShadow: st.running && st.asil_status === 'healthy' ? '0 0 30px #10b98133' : 'none',
            transition: 'all 0.5s',
          }}>
            <div style={{ fontSize: 24 }}>🛡</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#4ade80', marginTop: 4 }}>ASIL-B</div>
            <div style={{ fontSize: 9, color: '#555' }}>Safety Core</div>
            {st.running && (
              <div style={{ marginTop: 6, fontSize: 9, fontWeight: 700,
                color: st.asil_deadline_misses === 0 ? '#4ade80' : '#ef4444' }}>
                {st.asil_deadline_misses === 0 ? '✅ ZERO IMPACT' : `⚠ ${st.asil_deadline_misses} misses`}
              </div>
            )}
          </div>
        </div>

        {/* Right: Memory attacker */}
        <div style={{ gridColumn: 4, gridRow: 2 }}>
          <Arrow dir="left" active={attacks[1].active} color={attacks[1].color} />
        </div>
        <div style={{ gridColumn: 5, gridRow: 2 }}>
          <AttackBubble a={attacks[1]} />
        </div>

        {/* Row 3: bottom attacker (Network probe) */}
        <div />
        <div style={{ gridColumn: 3, gridRow: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <Arrow dir="up" active={attacks[3].active} color={attacks[3].color} />
          <AttackBubble a={attacks[3]} />
        </div>
        <div />
        <div />

      </div>
    </div>
  )
}

function AttackBubble({ a }: { a: { label: string; sublabel: string; icon: string; active: boolean; result: string | null; color: string } }) {
  return (
    <div style={{
      width: 130, padding: '10px 12px', borderRadius: 8, textAlign: 'center',
      background: a.active ? `${a.color}11` : '#111',
      border: `1px solid ${a.active ? a.color : '#222'}`,
      transition: 'all 0.3s',
    }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{a.icon}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: a.active ? a.color : '#666' }}>{a.label}</div>
      <div style={{ fontSize: 9, color: '#444', marginBottom: a.result ? 4 : 0 }}>{a.sublabel}</div>
      {a.result && (
        <div style={{
          fontSize: 9, fontWeight: 800, marginTop: 4, padding: '2px 6px', borderRadius: 3,
          background: a.result === 'BLOCKED' || a.result === 'OOM KILLED' || a.result === 'THROTTLED'
            ? '#052e16' : `${a.color}22`,
          color: a.result === 'BLOCKED' || a.result === 'OOM KILLED' || a.result === 'THROTTLED'
            ? '#4ade80' : a.color,
          border: `1px solid ${a.result === 'BLOCKED' || a.result === 'OOM KILLED' || a.result === 'THROTTLED' ? '#166534' : a.color + '44'}`,
        }}>
          {a.result}
        </div>
      )}
    </div>
  )
}

function Arrow({ dir, active, color }: { dir: 'up' | 'down' | 'left' | 'right'; active: boolean; color: string }) {
  const isHoriz = dir === 'left' || dir === 'right'
  return (
    <div style={{
      width: isHoriz ? 64 : 8, height: isHoriz ? 8 : 40,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      <div style={{
        width: isHoriz ? '100%' : 2,
        height: isHoriz ? 2 : '100%',
        background: active
          ? `linear-gradient(${dir === 'right' ? 'to right' : dir === 'left' ? 'to left' : dir === 'down' ? 'to bottom' : 'to top'}, ${color}, ${color}88)`
          : '#2a2a2a',
        transition: 'background 0.3s',
      }} />
    </div>
  )
}

function MemBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(value / max * 100, 100)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666', marginBottom: 4 }}>
        <span>Attacker memory</span>
        <span style={{ color: pct > 80 ? '#ef4444' : '#888' }}>{Math.round(value)} / {max} MB</span>
      </div>
      <div style={{ height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 3,
          background: pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#8b5cf6',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Narrative header ──────────────────────────────────────────────── */}
      <div style={{
        background: '#0d0d0d', border: '1px solid #1e1e1e',
        borderRadius: 10, padding: '16px 20px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#ee0000', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          RHIVOS Safety Isolation
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
          Can QM software hurt ASIL-B? Linux says no.
        </div>
        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>
          RHIVOS uses four Linux kernel mechanisms to give ASIL-B its own guaranteed resource slice.
          No matter what QM software does — burn CPU, leak memory, flood the network — the safety
          core stays inside its performance envelope. Click <b style={{ color: '#ef4444' }}>Full Attack</b> to prove it.
        </div>
      </div>

      {st.error && (
        <div style={{ background: '#1f0d0d', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#fca5a5' }}>
          ⚠ {st.error} — Make sure you've clicked <b>Build container images</b> first.
        </div>
      )}

      {/* ── Main two-column layout ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Left: attack diagram */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Attack diagram — real-time</span>
            {anyAttack && st.asil_status === 'healthy' && st.asil_deadline_misses === 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 800,
                color: '#4ade80', padding: '3px 10px', borderRadius: 4,
                background: '#052e16', border: '1px solid #166534',
              }}>✅ ZERO IMPACT</span>
            )}
          </div>
          <div className="card-body">
            <IsolationDiagram st={st} />

            {/* Stat row */}
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <div style={{ flex: 1, background: '#0d0d0d', borderRadius: 6, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: st.asil_deadline_misses === 0 && st.running ? '#4ade80' : '#555' }}>
                  {st.running ? st.asil_deadline_misses : '—'}
                </div>
                <div style={{ fontSize: 9, color: '#555' }}>deadline misses</div>
              </div>
              <div style={{ flex: 1, background: '#0d0d0d', borderRadius: 6, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>
                  {st.running ? fmtUptime(st.asil_uptime_s) : '—'}
                </div>
                <div style={{ fontSize: 9, color: '#555' }}>ASIL-B uptime</div>
              </div>
              <div style={{ flex: 1, background: '#0d0d0d', borderRadius: 6, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: anyAttack ? '#ef4444' : '#555' }}>
                  {[st.cpu_attack, st.mem_attack, st.temporal_attack].filter(Boolean).length} / 4
                </div>
                <div style={{ fontSize: 9, color: '#555' }}>attacks active</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: live latency chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">ASIL-B response latency</span>
            {lastMs != null && (
              <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: lastMs < 10 ? '#10b981' : '#ef4444' }}>
                {lastMs.toFixed(1)} ms
              </span>
            )}
          </div>
          <div className="card-body">
            <div style={{ height: 220 }}>
              {latencyData.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <div style={{ fontSize: 32, opacity: 0.3 }}>📊</div>
                  <div style={{ fontSize: 12, color: '#444', textAlign: 'center' }}>
                    Start the scenario to see live latency<br />
                    <span style={{ fontSize: 11, color: '#333' }}>10ms deadline line will appear</span>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer>
                  <LineChart data={latencyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                    <XAxis dataKey="i" hide />
                    <YAxis domain={[0, 30]} tick={{ fontSize: 10, fill: '#555' }} unit="ms" />
                    <Tooltip
                      formatter={(v: number) => [`${v.toFixed(2)} ms`, 'ASIL-B latency']}
                      contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }}
                    />
                    <ReferenceLine y={10} stroke="#ef4444" strokeDasharray="4 2"
                      label={{ value: '10ms deadline', fill: '#ef4444', fontSize: 9, position: 'insideTopRight' }} />
                    <Line type="monotone" dataKey="ms" stroke="#10b981" strokeWidth={2.5}
                      dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* What the chart proves */}
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#0d0d0d', borderRadius: 6, fontSize: 11, color: '#555', lineHeight: 1.6 }}>
              <span style={{ color: '#888' }}>What this proves:</span> even during a Full Attack, ASIL-B latency
              stays below the 10ms red line. The kernel enforces isolation — not application logic.
            </div>
          </div>
        </div>
      </div>

      {/* ── Attack controls + individual cards ────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Attack controls</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {!st.running ? (
              <button className="btn-primary" onClick={() => send('/iso/start')}>
                ▶ Start Scenario
              </button>
            ) : (
              <>
                {!allAttack ? (
                  <button className="btn-danger" onClick={() => send('/iso/attack/full')}>
                    🚨 Full Attack — all 4 vectors
                  </button>
                ) : (
                  <button className="btn-ghost" onClick={() => send('/iso/attack/stop')}>
                    ✋ Stop All Attacks
                  </button>
                )}
                <button className="btn-ghost" onClick={() => send('/iso/stop')}>Stop Scenario</button>
              </>
            )}
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>

            {/* CPU */}
            <div style={{
              padding: '14px', borderRadius: 8,
              background: st.cpu_attack ? '#1a0a0a' : '#0d0d0d',
              border: `1px solid ${st.cpu_attack ? '#f59e0b66' : '#1e1e1e'}`,
              transition: 'all 0.3s',
            }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>⚡</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>CPU Quota</div>
              <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6, marginBottom: 10 }}>
                Attacker burns CPU freely. ASIL-B gets its 40% slice regardless — enforced by
                <span style={{ color: '#f59e0b' }}> cgroups v2</span>.
              </div>
              {st.cpu_attack
                ? <button className="btn-ghost" style={{ fontSize: 10, width: '100%' }} onClick={() => send('/iso/attack/cpu/stop')}>Stop</button>
                : <button className="btn-ghost" style={{ fontSize: 10, width: '100%', borderColor: st.running ? '#f59e0b44' : undefined, color: st.running ? '#f59e0b' : undefined }}
                    disabled={!st.running} onClick={() => send('/iso/attack/cpu/start')}>
                    Launch CPU attack
                  </button>
              }
            </div>

            {/* Memory */}
            <div style={{
              padding: '14px', borderRadius: 8,
              background: st.mem_attack ? '#1a0a18' : '#0d0d0d',
              border: `1px solid ${st.mem_attack ? '#8b5cf666' : '#1e1e1e'}`,
              transition: 'all 0.3s',
            }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>💾</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Memory OOM</div>
              <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6, marginBottom: 8 }}>
                Attacker leaks memory until OOM-killed at
                <span style={{ color: '#8b5cf6' }}> 160 MB</span>. ci-asil memory: unchanged.
              </div>
              <MemBar value={st.attacker_mem_mb} max={160} />
              <div style={{ marginTop: 10 }}>
                {st.mem_attack
                  ? <button className="btn-ghost" style={{ fontSize: 10, width: '100%' }} onClick={() => send('/iso/attack/mem/stop')}>Stop</button>
                  : <button className="btn-ghost" style={{ fontSize: 10, width: '100%', borderColor: st.running ? '#8b5cf644' : undefined, color: st.running ? '#8b5cf6' : undefined }}
                      disabled={!st.running} onClick={() => send('/iso/attack/mem/start')}>
                      Launch memory attack
                    </button>
                }
              </div>
            </div>

            {/* Temporal */}
            <div style={{
              padding: '14px', borderRadius: 8,
              background: st.temporal_attack ? '#0a0a1a' : '#0d0d0d',
              border: `1px solid ${st.temporal_attack ? '#3b82f666' : '#1e1e1e'}`,
              transition: 'all 0.3s',
            }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>⏱</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Scheduling Flood</div>
              <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6, marginBottom: 10 }}>
                8 concurrent requests every 50ms create scheduling noise.
                <span style={{ color: '#3b82f6' }}> PREEMPT_RT</span> keeps ASIL-B deterministic.
              </div>
              {st.temporal_attack
                ? <button className="btn-ghost" style={{ fontSize: 10, width: '100%' }} onClick={() => send('/iso/attack/temporal/stop')}>Stop</button>
                : <button className="btn-ghost" style={{ fontSize: 10, width: '100%', borderColor: st.running ? '#3b82f644' : undefined, color: st.running ? '#3b82f6' : undefined }}
                    disabled={!st.running} onClick={() => send('/iso/attack/temporal/start')}>
                    Launch temporal attack
                  </button>
              }
            </div>

            {/* Spatial */}
            <div style={{
              padding: '14px', borderRadius: 8,
              background: st.spatial_probe_result ? '#0a1a0a' : '#0d0d0d',
              border: `1px solid ${st.spatial_probe_result ? '#10b98144' : '#1e1e1e'}`,
              transition: 'all 0.3s',
            }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>🌐</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Network Namespace</div>
              <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6, marginBottom: 10 }}>
                Attacker probes ASIL-B's container IP on
                <span style={{ color: '#10b981' }}> ci-isolated</span> network.
                Different namespace → no route.
              </div>
              {st.spatial_probe_result === 'blocked' ? (
                <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80' }}>
                  ✅ BLOCKED — {st.spatial_probe_ip}
                </div>
              ) : (
                <button className="btn-ghost" style={{ fontSize: 10, width: '100%', borderColor: st.running ? '#10b98144' : undefined, color: st.running ? '#10b981' : undefined }}
                  disabled={!st.running || st.spatial_probe_result === 'running'}
                  onClick={() => send('/iso/probe/spatial')}>
                  {st.spatial_probe_result === 'running' ? 'Probing…' : 'Run network probe'}
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── Event log ──────────────────────────────────────────────────────── */}
      {st.log.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Event log</span></div>
          <div className="card-body">
            <div className="log-box">
              {st.log.map((l, i) => (
                <p key={i} style={{
                  color: l.includes('✅') || l.includes('ZERO') || l.includes('BLOCKED') ? '#4ade80'
                       : l.includes('🚨') || l.includes('ATTACK') || l.includes('OOM') ? '#fca5a5'
                       : undefined,
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
