// Leerling dashboard

const { useState: useStateS } = React;

function StudentHome({ openReader }) {
  const urgent = STUDENT_TASKS.filter(t => t.urgent);
  const open = STUDENT_TASKS.filter(t => !t.urgent && t.status === 'open');
  const practice = STUDENT_TASKS.filter(t => t.status === 'practice');

  return (
    <div className="page">
      <div className="row-between" style={{marginBottom: 8}}>
        <div>
          <h1>Hoi Sara 👋</h1>
          <p className="page-sub">Er staan {STUDENT_TASKS.filter(t => t.status === 'open').length} teksten voor je klaar om voor te lezen.</p>
        </div>
        <button className="btn">
          <Icon name="upload" size={16}/> Eigen tekst voorlezen
        </button>
      </div>

      {urgent.length > 0 && (
        <div className="card" style={{
          marginBottom: 24,
          background: 'linear-gradient(135deg, #064e3b, #0a6b50)',
          border: 0,
          color: '#fff',
          padding: 24,
          borderRadius: 18,
          boxShadow: '0 8px 30px -10px rgba(6,78,59,.4)'
        }}>
          <div className="row" style={{gap: 8, marginBottom: 8, opacity: 0.85}}>
            <span className="live-dot" style={{background: '#a7f3d0'}}></span>
            <span style={{fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase'}}>Klaargezet voor vandaag</span>
          </div>
          <div style={{
            fontFamily: 'var(--font-read)', fontSize: 26,
            fontWeight: 500, letterSpacing: '-0.01em', marginBottom: 4
          }}>{urgent[0].title}</div>
          <div style={{opacity: 0.78, fontSize: 13, marginBottom: 18}}>
            {urgent[0].subject} · {urgent[0].teacher} · {urgent[0].minutes} min · {urgent[0].due}
          </div>
          <div className="row" style={{gap: 10}}>
            <button
              className="btn"
              style={{background: '#a7f3d0', color: '#064e3b', border: 0, fontWeight: 600}}
              onClick={() => openReader(urgent[0].id)}
            >
              <Icon name="play" size={14}/> Start voorlezen
            </button>
            <button className="btn" style={{
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.18)',
              color: '#fff'
            }}>
              <Icon name="settings" size={14}/> Mijn voorlees-instellingen
            </button>
          </div>
        </div>
      )}

      <SectionHeader
        title="Klaargezet voor jou"
        sub="Documenten die je school heeft klaargezet om voor te lezen"
      />
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14, marginBottom: 32}}>
        {open.map(t => (
          <TaskCard key={t.id} task={t} onClick={() => openReader(t.id)}/>
        ))}
      </div>

      <SectionHeader title="Eigen oefenmateriaal" sub="Vrij te lezen, geen vast moment"/>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14, marginBottom: 32}}>
        {practice.map(t => (
          <TaskCard key={t.id} task={t} onClick={() => openReader(t.id)}/>
        ))}
      </div>

      <SectionHeader title="Recent gelezen"/>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Tekst</th>
              <th>Vak</th>
              <th>Leestijd</th>
              <th>Datum</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {RECENT_DOCUMENTS.map(d => (
              <tr key={d.id}>
                <td><div style={{fontWeight: 500}}>{d.title}</div></td>
                <td><span style={{color: 'var(--muted)'}}>{d.subject}</span></td>
                <td><span style={{color: 'var(--muted)'}}>{d.minutes} min</span></td>
                <td><span style={{color: 'var(--muted)'}}>{d.date}</span></td>
                <td style={{textAlign: 'right'}}>
                  <button className="btn btn-sm btn-ghost"><Icon name="play" size={12}/> Opnieuw</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaskCard({ task, onClick }) {
  return (
    <div className="card card-pad" style={{display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer'}} onClick={onClick}>
      <div className="row-between">
        <Pill tone={task.status === 'practice' ? 'muted' : 'info'}>{task.subject}</Pill>
        {task.urgent && <Pill tone="warn">Vandaag</Pill>}
      </div>
      <div style={{
        fontFamily: 'var(--font-read)', fontSize: 17,
        fontWeight: 500, letterSpacing: '-0.005em',
        lineHeight: 1.3
      }}>{task.title}</div>
      <div style={{fontSize: 12.5, color: 'var(--muted)'}}>
        {task.teacher} · {task.minutes} min
      </div>
      <div className="row-between" style={{marginTop: 4}}>
        <div style={{fontSize: 12.5, color: 'var(--muted)'}}>
          <Icon name="clock" size={12}/> {task.due}
        </div>
        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); onClick(); }}>
          <Icon name="play" size={12}/> Start
        </button>
      </div>
    </div>
  );
}

window.StudentHome = StudentHome;
