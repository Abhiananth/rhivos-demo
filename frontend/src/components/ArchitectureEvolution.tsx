import { useState } from 'react'

const STAGES = [
  {
    id: 'ecu',
    era: 'Traditional',
    label: 'Dedicated ECU Hardware',
    year: 'Legacy',
    color: '#6b7280',
    description: 'Each function runs on its own dedicated microcontroller. ADAS ECU, IVI ECU, Gateway ECU — separate silicon, separate supply chains, separate software teams.',
    metrics: { cost: 'High', update: 'Factory recall', teams: '10+ separate', scale: 'New ECU per feature' },
    nodes: [
      { label: 'ADAS ECU', icon: '🚗', color: '#dc2626', sub: 'Dedicated chip\nARM Cortex-R5' },
      { label: 'IVI ECU', icon: '🎵', color: '#7c3aed', sub: 'Dedicated chip\nARM Cortex-A53' },
      { label: 'Gateway ECU', icon: '🔀', color: '#0369a1', sub: 'Dedicated chip\nRenesas RH850' },
      { label: 'Brake ECU', icon: '🛑', color: '#b45309', sub: 'Dedicated chip\nARM Cortex-M7' },
    ],
    downside: 'Scaling requires more hardware. Updates need physical access. No shared resources.',
  },
  {
    id: 'vm',
    era: 'Transition',
    label: 'Hypervisor + VMs',
    year: 'In progress',
    color: '#f59e0b',
    description: 'A Type-1 hypervisor (AUTOSAR, QNX, or Xen) consolidates workloads onto fewer physical boards. Each VM is fully isolated but carries a full OS stack.',
    metrics: { cost: 'Medium', update: 'OTA per-VM', teams: '4–6 teams', scale: 'New VM per workload' },
    nodes: [
      { label: 'VM: ADAS', icon: '🚗', color: '#dc2626', sub: 'Linux RTOS\n512 MB RAM' },
      { label: 'VM: IVI', icon: '🎵', color: '#7c3aed', sub: 'Android Auto\n2 GB RAM' },
      { label: 'VM: Gateway', icon: '🔀', color: '#0369a1', sub: 'Linux\n256 MB RAM' },
      { label: 'Hypervisor', icon: '⚙️', color: '#f59e0b', sub: 'Type-1\nAUTOSAR / Xen', isHost: true },
    ],
    downside: 'VMs carry full OS overhead. Hypervisor adds latency. Complex certification path.',
  },
  {
    id: 'rhivos',
    era: 'RHIVOS approach',
    label: 'Containers on Linux Kernel',
    year: 'Available now',
    color: '#ee0000',
    description: 'One RHIVOS kernel runs all workloads in Linux containers. cgroups v2 enforces strict CPU, memory, and I/O budgets. AutoSD provides the open-source upstream; RHIVOS adds ASIL-B certification.',
    metrics: { cost: 'Lower', update: 'OTA per-container', teams: '1 platform team', scale: 'New container per feature' },
    nodes: [
      { label: 'ASIL-B Container', icon: '🛡', color: '#ee0000', sub: '--cpus 0.4\n--memory 384m' },
      { label: 'QM Container', icon: '🎵', color: '#7c3aed', sub: '--cpus 0.6\n--memory 1g' },
      { label: 'Gateway Container', icon: '🔀', color: '#0369a1', sub: '--network isolated' },
      { label: 'RHIVOS Kernel', icon: '🐧', color: '#10b981', sub: 'cgroups v2 · PREEMPT_RT\nrpm-ostree · AutoSD', isHost: true },
    ],
    downside: null,
    upside: 'ASIL-B certified. Sub-second per-container OTA. Single kernel to maintain.',
  },
]

const COMPARE_ROWS = [
  { label: 'Hardware cost trend', ecu: 'High — per-function chip', vm: 'Medium — fewer boards', rhivos: 'Lower — shared compute' },
  { label: 'Wiring complexity', ecu: 'High — point-to-point', vm: 'Reduced — fewer boards', rhivos: 'Minimal — shared bus' },
  { label: 'OTA update', ecu: 'Recall or dealer visit', vm: 'Whole VM swap', rhivos: 'Per-container, atomic' },
  { label: 'Isolation mechanism', ecu: 'Physical silicon', vm: 'Hypervisor boundary', rhivos: 'Linux cgroups v2' },
  { label: 'ASIL-B certification', ecu: 'Per-chip cert', vm: 'Hypervisor cert', rhivos: 'Single kernel cert' },
  { label: 'Adding a new feature', ecu: 'New ECU hardware', vm: 'New VM image', rhivos: 'New container image' },
  { label: 'Mixed criticality', ecu: 'Separate chips', vm: 'Separate VMs', rhivos: 'ASIL-B + QM containers' },
]

export default function ArchitectureEvolution() {
  const [stage, setStage] = useState(2)  // start on RHIVOS
  const s = STAGES[stage]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#ee0000', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
          Architecture Evolution
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          How automotive software moved from silicon islands to a unified Linux platform
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>
          Click any era to explore — RHIVOS is the end-state
        </div>
      </div>

      {/* Stage selector */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        {STAGES.map((st, i) => (
          <button
            key={st.id}
            onClick={() => setStage(i)}
            style={{
              padding: '10px 24px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
              background: stage === i ? st.color : '#1a1a1a',
              border: `2px solid ${stage === i ? st.color : '#333'}`,
              color: stage === i ? '#fff' : '#888',
              fontWeight: 700, fontSize: 13,
            }}
          >
            <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>{st.year}</div>
            {st.era}
          </button>
        ))}
      </div>

      {/* Main visual */}
      <div style={{
        background: '#111', border: `1px solid ${s.color}33`, borderRadius: 12,
        padding: 24, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: s.color,
        }} />

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Left: description */}
          <div style={{ flex: '0 0 320px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              {s.era} · {s.year}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{s.label}</div>
            <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.7, marginBottom: 20 }}>
              {s.description}
            </div>
            {s.downside && (
              <div style={{ background: '#1f0d0d', border: '1px solid #5c2020', borderRadius: 6, padding: '10px 14px', fontSize: 11, color: '#f87171' }}>
                ⚠ {s.downside}
              </div>
            )}
            {s.upside && (
              <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: 6, padding: '10px 14px', fontSize: 11, color: '#4ade80' }}>
                ✅ {s.upside}
              </div>
            )}
          </div>

          {/* Center: node diagram */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {s.nodes.filter(n => !n.isHost).map(n => (
                <div key={n.label} style={{
                  background: `${n.color}18`, border: `1px solid ${n.color}44`,
                  borderRadius: 8, padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ fontSize: 24 }}>{n.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: n.color }}>{n.label}</div>
                    <div style={{ fontSize: 10, color: '#666', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{n.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Host / base platform */}
            {s.nodes.find(n => n.isHost) && (() => {
              const host = s.nodes.find(n => n.isHost)!
              return (
                <div style={{
                  background: `${host.color}22`, border: `2px solid ${host.color}55`,
                  borderRadius: 8, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ fontSize: 22 }}>{host.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: host.color }}>{host.label}</div>
                    <div style={{ fontSize: 10, color: '#777', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{host.sub}</div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Right: metrics */}
          <div style={{ flex: '0 0 160px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(s.metrics).map(([k, v]) => (
              <div key={k} style={{ background: '#0d0d0d', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#555', textTransform: 'capitalize', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{v as string}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div style={{ background: '#111', border: '1px solid #222', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Architecture comparison
          </span>
          <span style={{ fontSize: 10, color: '#444', fontStyle: 'italic' }}>
            Directional comparison — actual numbers depend on platform and OEM implementation
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#0d0d0d' }}>
              <th style={{ padding: '8px 16px', textAlign: 'left', color: '#555', fontWeight: 600, width: '30%' }}>Dimension</th>
              {STAGES.map((st, i) => (
                <th key={st.id} style={{
                  padding: '8px 16px', textAlign: 'center', fontWeight: 700,
                  color: stage === i ? st.color : '#555',
                  background: stage === i ? `${st.color}11` : 'transparent',
                }}>
                  {st.era}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row, ri) => (
              <tr key={row.label} style={{ borderTop: '1px solid #1a1a1a', background: ri % 2 === 0 ? '#0a0a0a' : 'transparent' }}>
                <td style={{ padding: '8px 16px', color: '#888', fontWeight: 500 }}>{row.label}</td>
                <td style={{ padding: '8px 16px', textAlign: 'center', color: stage === 0 ? '#6b7280' : '#444' }}>{row.ecu}</td>
                <td style={{ padding: '8px 16px', textAlign: 'center', color: stage === 1 ? '#f59e0b' : '#444' }}>{row.vm}</td>
                <td style={{ padding: '8px 16px', textAlign: 'center', color: '#10b981', fontWeight: stage === 2 ? 700 : 400 }}>{row.rhivos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Navigation hint */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        {stage > 0 && (
          <button className="btn-ghost" onClick={() => setStage(stage - 1)}>
            ← {STAGES[stage - 1].era}
          </button>
        )}
        {stage < STAGES.length - 1 && (
          <button className="btn-primary" onClick={() => setStage(stage + 1)}>
            Next: {STAGES[stage + 1].era} →
          </button>
        )}
      </div>
    </div>
  )
}
