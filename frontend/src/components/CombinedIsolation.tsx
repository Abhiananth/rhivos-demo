import { useEffect, useRef, useState } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }

interface SIsoState {
  running: boolean
  asil_status: string
  attacker_status: string
  asil_latency: number[]
  attacker_latency: number[]
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
  asil_latency: [], attacker_latency: [], asil_uptime_s: 0, asil_deadline_misses: 0,
  cpu_attack: false, mem_attack: false, temporal_attack: false,
  spatial_probe_result: null, spatial_probe_ip: null,
  attacker_mem_mb: 0, log: [], error: null,
}

function fmtUptime(s: number) {
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

// ── Animated preview chart (shown before scenario starts) ─────────────────
function usePreviewData(running: boolean) {
  const [data, setData] = useState<{ i: number; asil: number; qm: number; phase: number }[]>([])
  const frame = useRef(0)

  useEffect(() => {
    if (running) return
    const seed: typeof data = Array.from({ length: 40 }, (_, i) => ({
      i, asil: 2 + Math.random() * 1.5, qm: 3 + Math.random() * 2, phase: 0,
    }))
    setData(seed)

    const timer = setInterval(() => {
      frame.current += 1
      const phase = Math.floor(frame.current / 20) % 3  // 0=idle, 1=attack, 2=attack
      const attacking = phase > 0
      setData(prev => {
        const last = prev[prev.length - 1]?.i ?? 0
        const qm = attacking
          ? 18 + Math.random() * 25
          : 3 + Math.random() * 2
        return [...prev.slice(-59), { i: last + 1, asil: 2 + Math.random() * 1.5, qm, phase }]
      })
    }, 350)
    return () => clearInterval(timer)
  }, [running])

  return data
}

// ── Horizontal gauge bar ──────────────────────────────────────────────────
function GaugeBar({
  label, value, max, color, unit = '%', animated = false,
}: {
  label: string; value: number; max: number; color: string; unit?: string; animated?: boolean
}) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 10 }}>
        <span style={{ color: '#888' }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>
          {Math.round(value)}{unit}
        </span>
      </div>
      <div style={{ height: 10, background: '#1a1a1a', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 5, background: color,
          transition: animated ? 'width 0.6s ease' : 'width 0.3s',
          boxShadow: pct > 70 ? `0 0 8px ${color}88` : 'none',
        }} />
      </div>
    </div>
  )
}

// ── Mini jitter dots ──────────────────────────────────────────────────────
function JitterDots({ active }: { active: boolean }) {
  const [dots, setDots] = useState<{ x: number; y: number; key: number }[]>([])
  const counter = useRef(0)

  useEffect(() => {
    const interval = setInterval(() => {
      counter.current += 1
      setDots(prev => {
        const next = [...prev.slice(-15), {
          x: (counter.current % 20) * 5,
          y: active ? 15 + Math.random() * 70 : 60 + Math.random() * 20,
          key: counter.current,
        }]
        return next
      })
    }, active ? 200 : 600)
    return () => clearInterval(interval)
  }, [active])

  return (
    <svg width="100%" height={60} style={{ overflow: 'visible' }}>
      <line x1="0" y1={55} x2="100%" y2={55} stroke="#2a2a2a" strokeWidth={1} />
      <line x1="0" y1={20} x2="100%" y2={20} stroke="#ef444422" strokeWidth={1} strokeDasharray="3 2" />
      <text x={2} y={18} fontSize={8} fill="#ef4444" opacity={0.5}>deadline</text>
      {dots.map((d, i) => (
        <circle
          key={d.key}
          cx={`${(i / 15) * 100}%`}
          cy={d.y}
          r={3}
          fill={d.y < 20 ? '#ef4444' : active ? '#f59e0b' : '#10b981'}
          opacity={0.7 + (i / 15) * 0.3}
        />
      ))}
    </svg>
  )
}

// ── Network topology mini-diagram ─────────────────────────────────────────
function NetworkTopology({ probeResult }: { probeResult: string | null }) {
  const blocked = probeResult === 'blocked'
  const probing = probeResult === 'running'

  return (
    <svg viewBox="0 0 200 80" width="100%" height={80}>
      {/* Host → ASIL-B: allowed (green) */}
      <rect x={2} y={8} width={40} height={20} rx={4} fill="#1a1a1a" stroke="#333" />
      <text x={22} y={22} fontSize={7} fill="#888" textAnchor="middle">Host</text>

      <line x1={42} y1={18} x2={90} y2={18} stroke="#10b981" strokeWidth={1.5} />
      <text x={66} y={14} fontSize={7} fill="#10b981" textAnchor="middle">:8901 ✓</text>
      <polygon points="90,14 90,22 98,18" fill="#10b981" />

      {/* ASIL-B center */}
      <rect x={98} y={4} width={44} height={28} rx={6} fill="#052e16" stroke="#166534" strokeWidth={1.5} />
      <text x={120} y={16} fontSize={7} fill="#4ade80" textAnchor="middle" fontWeight="bold">ASIL-B</text>
      <text x={120} y={26} fontSize={6} fill="#555" textAnchor="middle">ci-isolated</text>

      {/* QM attacker → ASIL-B: blocked */}
      <rect x={2} y={52} width={40} height={20} rx={4}
        fill={probing ? '#1a0a0a' : blocked ? '#1a0808' : '#1a1a1a'}
        stroke={probing ? '#f59e0b' : blocked ? '#7f1d1d' : '#333'} />
      <text x={22} y={66} fontSize={7} fill={blocked ? '#f87171' : '#888'} textAnchor="middle">QM</text>

      {/* Attempt arrow */}
      <line x1={42} y1={62} x2={88} y2={30} stroke={probing ? '#f59e0b' : blocked ? '#ef4444' : '#333'}
        strokeWidth={1.5} strokeDasharray={blocked ? '3 2' : 'none'} />

      {/* X or ? */}
      {blocked && (
        <>
          <circle cx={65} cy={46} r={8} fill="#1f0d0d" stroke="#7f1d1d" strokeWidth={1} />
          <text x={65} y={50} fontSize={9} fill="#ef4444" textAnchor="middle" fontWeight="bold">✕</text>
        </>
      )}
      {probing && (
        <>
          <circle cx={65} cy={46} r={8} fill="#1a1000" stroke="#f59e0b" strokeWidth={1} />
          <text x={65} y={50} fontSize={8} fill="#f59e0b" textAnchor="middle">…</text>
        </>
      )}
      {!blocked && !probing && (
        <text x={65} y={50} fontSize={7} fill="#333" textAnchor="middle">blocked?</text>
      )}

      {/* Labels */}
      <text x={100} y={75} fontSize={7} fill={blocked ? '#4ade80' : '#555'} textAnchor="middle">
        {blocked ? 'Namespace isolation: ACTIVE ✅' : probing ? 'Probing…' : 'Run probe to verify'}
      </text>
    </svg>
  )
}

export default function CombinedIsolation({ lastMsg, send }: Props) {
  const [st, setSt] = useState<SIsoState>(INIT)
  const previewData = usePreviewData(st.running)

  useEffect(() => {
    if (!lastMsg) return
    if (lastMsg.type === 'init' && lastMsg.siso) setSt(lastMsg.siso as SIsoState)
    if (lastMsg.type === 'siso_state') setSt(lastMsg as unknown as SIsoState)
  }, [lastMsg])

  const anyAttack = st.cpu_attack || st.mem_attack || st.temporal_attack
  const lastAsil = st.asil_latency[st.asil_latency.length - 1]
  const lastAtk = st.attacker_latency[st.attacker_latency.length - 1]

  // Build chart data: live when running, preview otherwise
  const chartData = st.running
    ? st.asil_latency.map((ms, i) => ({
        i,
        'ASIL-B (protected)': Math.min(ms, 60),
        'QM Attacker': st.attacker_latency[i] != null ? Math.min(st.attacker_latency[i], 300) : null,
      }))
    : previewData.map(d => ({
        i: d.i,
        'ASIL-B (protected)': d.asil,
        'QM Attacker': d.qm,
        _preview: true,
      }))

  const isAttacking = anyAttack || (previewData.length > 0 && previewData[previewData.length - 1]?.phase > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header + controls ──────────────────────────────────────────── */}
      <div style={{
        background: anyAttack && st.running ? '#1a0505' : '#0d0d0d',
        border: `1px solid ${anyAttack && st.running ? '#7f1d1d' : '#1e1e1e'}`,
        borderRadius: 10, padding: '16px 20px', transition: 'all 0.4s',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ee0000', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              RHIVOS Safety Isolation
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              Can QM software hurt ASIL-B? Linux says no.
            </div>
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
              Four kernel mechanisms guarantee ASIL-B its own CPU slice, memory budget, schedule priority, and network namespace.
              Hit <b style={{ color: '#ef4444' }}>Full Attack</b> — watch the green line stay flat.
            </div>
          </div>

          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
            {!st.running ? (
              <button className="btn-primary" style={{ padding: '12px 28px', fontSize: 14, fontWeight: 800 }}
                onClick={() => send('/iso/start')}>
                ▶ Start Scenario
              </button>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!(st.cpu_attack && st.mem_attack && st.temporal_attack)
                    ? <button className="btn-danger" style={{ fontWeight: 800, padding: '10px 20px' }}
                        onClick={() => send('/iso/attack/full')}>
                        🚨 Full Attack
                      </button>
                    : <button className="btn-ghost" onClick={() => send('/iso/attack/stop')}>
                        ✋ Stop All Attacks
                      </button>
                  }
                  <button className="btn-ghost" onClick={() => send('/iso/stop')}>Stop</button>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: st.asil_deadline_misses === 0 ? '#4ade80' : '#ef4444' }}>
                      {st.asil_deadline_misses}
                    </div>
                    <div style={{ fontSize: 9, color: '#555' }}>deadline misses</div>
                  </div>
                  <div style={{ width: 1, background: '#222' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>
                      {fmtUptime(st.asil_uptime_s)}
                    </div>
                    <div style={{ fontSize: 9, color: '#555' }}>ASIL-B uptime</div>
                  </div>
                  {anyAttack && st.asil_deadline_misses === 0 && (
                    <>
                      <div style={{ width: 1, background: '#222' }} />
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#4ade80', padding: '4px 10px', background: '#052e16', border: '1px solid #166534', borderRadius: 6 }}>
                          ✅ ZERO IMPACT
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {st.error && (
        <div style={{ background: '#1f0d0d', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#fca5a5' }}>
          ⚠ {st.error} — Make sure you've clicked <b>Build container images</b> first.
        </div>
      )}

      {/* ── Hero chart ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            {st.running ? 'Live: ASIL-B vs QM Attacker latency' : 'Preview: what happens when you attack ASIL-B'}
          </span>
          {!st.running && (
            <span style={{ marginLeft: 8, fontSize: 10, color: '#555', fontStyle: 'italic' }}>
              animated simulation — {isAttacking ? 'ATTACK PHASE' : 'idle phase'}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            {lastAsil != null && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>
                ASIL-B: {lastAsil.toFixed(1)} ms
              </span>
            )}
            {lastAtk != null && (
              <span style={{ fontSize: 12, fontWeight: 700, color: lastAtk > 20 ? '#ef4444' : '#f59e0b' }}>
                Attacker: {lastAtk > 200 ? '⚡ spike' : `${lastAtk.toFixed(1)} ms`}
              </span>
            )}
          </div>
        </div>
        <div className="card-body">
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="asilGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="atkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                <XAxis dataKey="i" hide />
                <YAxis
                  domain={[0, 60]}
                  tick={{ fontSize: 10, fill: '#555' }}
                  tickFormatter={v => `${v}ms`}
                />
                <Tooltip
                  contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }}
                  formatter={(v: number, name: string) => [
                    `${v.toFixed(1)} ms`,
                    name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(value) => (
                    <span style={{ color: value === 'ASIL-B (protected)' ? '#10b981' : '#ef4444' }}>
                      {value}
                    </span>
                  )}
                />
                <ReferenceLine y={10} stroke="#ef4444" strokeDasharray="5 3" strokeWidth={1.5}
                  label={{ value: '10ms safety deadline', fill: '#ef4444', fontSize: 9, position: 'insideTopRight' }} />
                <Area
                  type="monotone" dataKey="ASIL-B (protected)"
                  stroke="#10b981" strokeWidth={2.5} fill="url(#asilGrad)"
                  dot={false} isAnimationActive={false} connectNulls
                />
                <Area
                  type="monotone" dataKey="QM Attacker"
                  stroke="#ef4444" strokeWidth={2} fill="url(#atkGrad)"
                  dot={false} isAnimationActive={false} connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Chart legend / explainer */}
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <div style={{ flex: 1, background: '#051e10', border: '1px solid #166534', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
              <span style={{ color: '#4ade80', fontWeight: 700 }}>Green line (ASIL-B):</span>
              <span style={{ color: '#666' }}> stays below 10ms regardless of attacks — kernel-enforced</span>
            </div>
            <div style={{ flex: 1, background: '#1f0808', border: '1px solid #7f1d1d', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
              <span style={{ color: '#f87171', fontWeight: 700 }}>Red line (QM Attacker):</span>
              <span style={{ color: '#666' }}> spikes under load — no safety guarantee, as expected</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4 attack cards ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>

        {/* ① CPU */}
        <div className="card" style={{ borderColor: st.cpu_attack ? '#f59e0b44' : undefined }}>
          <div className="card-header">
            <span style={{ fontSize: 16 }}>⚡</span>
            <span className="card-title" style={{ marginLeft: 6 }}>CPU Quota</span>
            {st.cpu_attack && (
              <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#f59e0b',
                animation: 'pulse 1s infinite' }}>BURNING</span>
            )}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            <GaugeBar label="ASIL-B reserved" value={40} max={100} color="#10b981" />
            <GaugeBar
              label="Attacker CPU"
              value={st.cpu_attack ? 90 + Math.random() * 8 : 12}
              max={100}
              color={st.cpu_attack ? '#ef4444' : '#555'}
              animated
            />
            <div style={{ fontSize: 10, color: '#555', lineHeight: 1.5, margin: '8px 0 10px' }}>
              cgroups v2 guarantees ASIL-B its 40% even when attacker burns 100%.
            </div>
            {st.cpu_attack
              ? <button className="btn-ghost" style={{ fontSize: 10, width: '100%' }}
                  onClick={() => send('/iso/attack/cpu/stop')}>Stop attack</button>
              : <button disabled={!st.running} style={{
                  width: '100%', padding: '6px', fontSize: 10, fontWeight: 700,
                  background: st.running ? '#1a0a0022' : '#111',
                  border: `1px solid ${st.running ? '#f59e0b44' : '#222'}`,
                  color: st.running ? '#f59e0b' : '#444', borderRadius: 6, cursor: st.running ? 'pointer' : 'not-allowed',
                }} onClick={() => send('/iso/attack/cpu/start')}>
                  Launch CPU attack
                </button>
            }
          </div>
        </div>

        {/* ② Memory */}
        <div className="card" style={{ borderColor: st.mem_attack ? '#8b5cf644' : undefined }}>
          <div className="card-header">
            <span style={{ fontSize: 16 }}>💾</span>
            <span className="card-title" style={{ marginLeft: 6 }}>Memory OOM</span>
            {st.attacker_status === 'oom-killed' && (
              <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#4ade80' }}>OOM KILLED ✅</span>
            )}
            {st.mem_attack && st.attacker_status !== 'oom-killed' && (
              <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#8b5cf6',
                animation: 'pulse 1s infinite' }}>LEAKING</span>
            )}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            <GaugeBar label="ASIL-B memory" value={st.running ? 38 : 0} max={384} unit=" MB" color="#10b981" />
            <GaugeBar
              label="Attacker memory"
              value={st.attacker_mem_mb}
              max={160}
              unit=" MB"
              color={st.attacker_mem_mb > 120 ? '#ef4444' : '#8b5cf6'}
            />
            <div style={{ fontSize: 10, color: '#555', lineHeight: 1.5, margin: '8px 0 10px' }}>
              Attacker OOM-killed at 160 MB. ASIL-B (384 MB limit) unaffected.
            </div>
            {st.mem_attack
              ? <button className="btn-ghost" style={{ fontSize: 10, width: '100%' }}
                  onClick={() => send('/iso/attack/mem/stop')}>Stop attack</button>
              : <button disabled={!st.running} style={{
                  width: '100%', padding: '6px', fontSize: 10, fontWeight: 700,
                  background: st.running ? '#1a001a22' : '#111',
                  border: `1px solid ${st.running ? '#8b5cf644' : '#222'}`,
                  color: st.running ? '#8b5cf6' : '#444', borderRadius: 6, cursor: st.running ? 'pointer' : 'not-allowed',
                }} onClick={() => send('/iso/attack/mem/start')}>
                  Launch memory attack
                </button>
            }
          </div>
        </div>

        {/* ③ Temporal */}
        <div className="card" style={{ borderColor: st.temporal_attack ? '#3b82f644' : undefined }}>
          <div className="card-header">
            <span style={{ fontSize: 16 }}>⏱</span>
            <span className="card-title" style={{ marginLeft: 6 }}>Scheduling</span>
            {st.temporal_attack && (
              <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#3b82f6',
                animation: 'pulse 1s infinite' }}>FLOODING</span>
            )}
          </div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>
                Scheduling jitter — dots above red line = deadline breach
              </div>
              <JitterDots active={st.temporal_attack} />
            </div>
            <div style={{ fontSize: 10, color: '#555', lineHeight: 1.5, margin: '4px 0 10px' }}>
              8 concurrent floods/50ms create scheduling noise. ASIL-B stays deterministic via PREEMPT_RT.
            </div>
            {st.temporal_attack
              ? <button className="btn-ghost" style={{ fontSize: 10, width: '100%' }}
                  onClick={() => send('/iso/attack/temporal/stop')}>Stop attack</button>
              : <button disabled={!st.running} style={{
                  width: '100%', padding: '6px', fontSize: 10, fontWeight: 700,
                  background: st.running ? '#00001a22' : '#111',
                  border: `1px solid ${st.running ? '#3b82f644' : '#222'}`,
                  color: st.running ? '#3b82f6' : '#444', borderRadius: 6, cursor: st.running ? 'pointer' : 'not-allowed',
                }} onClick={() => send('/iso/attack/temporal/start')}>
                  Launch scheduling flood
                </button>
            }
          </div>
        </div>

        {/* ④ Spatial */}
        <div className="card" style={{ borderColor: st.spatial_probe_result === 'blocked' ? '#10b98144' : undefined }}>
          <div className="card-header">
            <span style={{ fontSize: 16 }}>🌐</span>
            <span className="card-title" style={{ marginLeft: 6 }}>Network Namespace</span>
            {st.spatial_probe_result === 'blocked' && (
              <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#4ade80' }}>BLOCKED ✅</span>
            )}
          </div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            <NetworkTopology probeResult={st.spatial_probe_result} />
            <div style={{ fontSize: 10, color: '#555', lineHeight: 1.5, margin: '6px 0 10px' }}>
              QM container and ASIL-B are on different network namespaces. Direct access is impossible.
            </div>
            {st.spatial_probe_result === 'blocked'
              ? <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', padding: '6px', textAlign: 'center',
                  background: '#052e16', borderRadius: 6, border: '1px solid #166534' }}>
                  ✅ Blocked — {st.spatial_probe_ip}
                </div>
              : <button disabled={!st.running || st.spatial_probe_result === 'running'} style={{
                  width: '100%', padding: '6px', fontSize: 10, fontWeight: 700,
                  background: st.running ? '#00110022' : '#111',
                  border: `1px solid ${st.running ? '#10b98144' : '#222'}`,
                  color: st.running ? '#10b981' : '#444', borderRadius: 6,
                  cursor: st.running && st.spatial_probe_result !== 'running' ? 'pointer' : 'not-allowed',
                }} onClick={() => send('/iso/probe/spatial')}>
                  {st.spatial_probe_result === 'running' ? '🔍 Probing…' : 'Run network probe'}
                </button>
            }
          </div>
        </div>

      </div>

      {/* ── Event log ──────────────────────────────────────────────────── */}
      {st.log.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Event log</span></div>
          <div className="card-body">
            <div className="log-box">
              {st.log.map((l, i) => (
                <p key={i} style={{
                  color: l.includes('✅') || l.includes('ZERO') || l.includes('BLOCKED') ? '#4ade80'
                       : l.includes('🚨') || l.includes('ATTACK') || l.includes('OOM') || l.includes('💥') ? '#fca5a5'
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
