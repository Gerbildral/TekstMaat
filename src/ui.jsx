// Shared UI primitives

function Avatar({ name, size = 32 }) {
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  // Deterministic hue from name
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const bg = `oklch(0.92 0.06 ${h})`;
  const fg = `oklch(0.32 0.08 ${h})`;
  return (
    <div className="avatar" style={{
      width: size, height: size,
      background: bg, color: fg,
      fontSize: size * 0.38
    }}>{initials}</div>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className="card card-pad">
      <div style={{fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600}}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-read)',
        fontSize: 32, fontWeight: 500,
        marginTop: 6,
        color: accent || 'var(--ink)',
        letterSpacing: '-0.02em'
      }}>{value}</div>
      {sub && <div style={{fontSize: 13, color: 'var(--muted)', marginTop: 2}}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, sub, action }) {
  return (
    <div className="row-between" style={{marginBottom: 14, alignItems: 'flex-end'}}>
      <div>
        <h2 style={{
          fontFamily: 'var(--font-read)', fontWeight: 500,
          fontSize: 20, margin: 0, letterSpacing: '-0.01em'
        }}>{title}</h2>
        {sub && <div style={{fontSize: 13, color: 'var(--muted)', marginTop: 2}}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

function Pill({ tone, children }) {
  const map = {
    ok:    { bg: '#ecfdf5', fg: '#065f46', dot: '#10b981' },
    warn:  { bg: '#fef8eb', fg: '#92400e', dot: '#d97706' },
    info:  { bg: '#eff6ff', fg: '#1e40af', dot: '#2563eb' },
    muted: { bg: 'var(--bg)', fg: 'var(--muted)', dot: 'var(--muted-2)' },
    draft: { bg: '#f5f3ff', fg: '#5b21b6', dot: '#8b5cf6' }
  };
  const t = map[tone] || map.muted;
  return (
    <span className="chip" style={{background: t.bg, color: t.fg, borderColor: 'transparent'}}>
      <span className="chip-dot" style={{background: t.dot}}></span>
      {children}
    </span>
  );
}

function Sparkbar({ data, max, height = 56 }) {
  const m = max || Math.max(...data.map(d => d.hours));
  return (
    <div style={{display: 'flex', alignItems: 'flex-end', gap: 8, height: height + 18}}>
      {data.map((d, i) => (
        <div key={i} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1}}>
          <div style={{
            width: '100%',
            height: (d.hours / m) * height,
            background: i === 3 ? 'var(--primary)' : 'var(--accent-soft)',
            borderRadius: 4,
            minHeight: 2
          }} title={`${d.day}: ${d.hours}u`}></div>
          <div style={{fontSize: 11, color: 'var(--muted)'}}>{d.day}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Avatar, Stat, SectionHeader, Pill, Sparkbar });
