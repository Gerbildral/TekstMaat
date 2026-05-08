// Main app shell: role switcher, sidebar, route to screens, tweaks panel

const { useState: useStateApp, useEffect: useEffectApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "highlightMode": "word",
  "accent": "#a7f3d0",
  "sentenceTint": "#ecfdf5",
  "font": "serif",
  "fontSize": 22,
  "lineHeight": 1.7,
  "colWidth": 720,
  "paper": "white",
  "ruler": false,
  "dyslexicUI": false
}/*EDITMODE-END*/;

const ROLES = [
  { id: 'student', label: 'Leerling', name: 'Sara Boukhriss', school: '3 HAVO/VWO-A' },
  { id: 'admin',   label: 'School-admin', name: 'Mark Visser', school: 'ICT-coördinator' },
];

const NAV = {
  student: [
    { id: 'home',     label: 'Klaargezet voor jou', icon: 'home', badge: 4 },
    { id: 'history',  label: 'Geschiedenis', icon: 'clock' },
    { id: 'settings', label: 'Mijn voorlees-instellingen', icon: 'settings' },
  ],
  admin: [
    { id: 'overview',     label: 'Overzicht',     icon: 'chart' },
    { id: 'documents',    label: 'Documenten',    icon: 'fileText', badge: 4 },
    { id: 'students',     label: 'Leerlingen',    icon: 'users' },
    { id: 'classes',      label: 'Klassen',       icon: 'graduation' },
    { id: 'integrations', label: 'Koppelingen',   icon: 'link', badge: 2 },
    { id: 'licenses',     label: 'Licenties',     icon: 'shield' },
    { id: 'logs',         label: 'Audit log',     icon: 'fileText' },
  ]
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [role, setRole] = useStateApp('student');
  const [nav, setNav] = useStateApp('home');
  const [readerDocId, setReaderDocId] = useStateApp(null);
  const [uploaderOpen, setUploaderOpen] = useStateApp(false);
  // Dynamisch toegevoegde documenten (na upload door admin)
  const [extraDocs, setExtraDocs] = useStateApp([]);

  // Reset nav when switching role
  useEffectApp(() => {
    setNav(NAV[role][0].id);
  }, [role]);

  // Apply dyslexic UI class globally
  useEffectApp(() => {
    document.body.classList.toggle('dys-ui', !!t.dyslexicUI);
  }, [t.dyslexicUI]);

  const openReader = (docId) => setReaderDocId(docId);

  const handlePublish = (docEntry) => {
    setExtraDocs(prev => [...prev, docEntry]);
  };

  const allDocs = { ...SAMPLE_TEXTS };
  extraDocs.forEach(d => { allDocs[d.id] = d; });

  const currentRole = ROLES.find(r => r.id === role);

  return (
    <>
      <div className="app">
        <header className="topbar">
          <div className="row" style={{gap: 24}}>
            <div className="brand">
              <div className="brand-mark">T</div>
              Tekstmaat
            </div>
            <div style={{
              fontSize: 12, color: 'var(--muted)',
              padding: '4px 10px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 999
            }}>
              <Icon name="graduation" size={11}/> CL De Maas
            </div>
          </div>

          <div className="row" style={{gap: 14}}>
            <div className="role-switch" title="Wissel rol om de hele omgeving te verkennen">
              {ROLES.map(r => (
                <button
                  key={r.id}
                  className={role === r.id ? 'active' : ''}
                  onClick={() => setRole(r.id)}
                >{r.label}</button>
              ))}
            </div>

            <button className="icon-btn" title="Meldingen">
              <Icon name="bell" size={16}/>
            </button>
            <div className="row" style={{gap: 8}}>
              <Avatar name={currentRole.name} size={32}/>
              <div style={{lineHeight: 1.15}}>
                <div style={{fontSize: 13, fontWeight: 500}}>{currentRole.name}</div>
                <div style={{fontSize: 11, color: 'var(--muted)'}}>{currentRole.school}</div>
              </div>
            </div>
          </div>
        </header>

        <aside className="sidebar">
          <div className="nav-section">
            {role === 'student' ? 'Leerling' : 'School-beheer'}
          </div>
          {NAV[role].map(item => (
            <button
              key={item.id}
              className={'nav-item ' + (nav === item.id ? 'active' : '')}
              onClick={() => setNav(item.id)}
            >
              <Icon name={item.icon} size={16}/>
              <span className="grow">{item.label}</span>
              {item.badge && <span className="nav-badge">{item.badge}</span>}
            </button>
          ))}

          <div style={{flex: 1}}></div>
        </aside>

        <main className="main">
          {role === 'student' && nav === 'home'     && <StudentHome openReader={openReader} extraDocs={extraDocs}/>}
          {role === 'student' && nav === 'history'  && <StudentHistory openReader={openReader}/>}
          {role === 'student' && nav === 'settings' && <StudentSettings/>}

          {role === 'admin' && nav === 'overview' && <AdminOverview onOpenUploader={() => setUploaderOpen(true)}/>}
          {role === 'admin' && nav === 'documents' && <TeacherTests onOpenUploader={() => setUploaderOpen(true)}/>}
          {role === 'admin' && nav === 'students' && <TeacherStudents/>}
          {role === 'admin' && nav === 'classes' && <AdminClasses/>}
          {role === 'admin' && nav === 'integrations' && <AdminIntegrations/>}
          {role === 'admin' && nav === 'licenses' && <AdminLicenses/>}
          {role === 'admin' && nav === 'logs' && <PlaceholderPage title="Audit log" sub="Wijzigingen, logins en synchronisaties — laatste 90 dagen"/>}
        </main>
      </div>

      {readerDocId && (
        <Reader
          doc={allDocs[readerDocId] || SAMPLE_TEXTS.bio}
          onClose={() => setReaderDocId(null)}
          tweaks={{
            highlightMode: t.highlightMode,
            accent: t.accent,
            sentenceTint: t.sentenceTint,
            font: t.font,
            fontSize: t.fontSize,
            lineHeight: t.lineHeight,
            colWidth: t.colWidth,
            paper: t.paper,
            ruler: t.ruler
          }}
        />
      )}

      {uploaderOpen && (
        <TeacherUploader
          onClose={() => setUploaderOpen(false)}
          onPublish={handlePublish}
        />
      )}

      <TweaksPanel>
        <TweakSection label="Voorlezen"/>
        <TweakRadio
          label="Highlight"
          value={t.highlightMode}
          options={[{value:'word',label:'Woord'},{value:'sentence',label:'Zin'},{value:'both',label:'Beide'}]}
          onChange={(v) => setTweak('highlightMode', v)}
        />
        <TweakColor
          label="Highlight-kleur"
          value={t.accent}
          options={['#a7f3d0', '#fde68a', '#fbcfe8', '#bae6fd', '#ddd6fe']}
          onChange={(v) => setTweak('accent', v)}
        />

        <TweakSection label="Lezen"/>
        <TweakRadio
          label="Lettertype"
          value={t.font}
          options={[{value:'serif',label:'Serif'},{value:'sans',label:'Sans'},{value:'dyslexic',label:'Dyslexie'}]}
          onChange={(v) => setTweak('font', v)}
        />
        <TweakSlider
          label="Tekstgrootte"
          value={t.fontSize}
          min={16} max={32} step={1} unit="px"
          onChange={(v) => setTweak('fontSize', v)}
        />
        <TweakSlider
          label="Regelafstand"
          value={t.lineHeight}
          min={1.3} max={2.2} step={0.05}
          onChange={(v) => setTweak('lineHeight', v)}
        />
        <TweakSlider
          label="Kolombreedte"
          value={t.colWidth}
          min={520} max={920} step={20} unit="px"
          onChange={(v) => setTweak('colWidth', v)}
        />
        <TweakColor
          label="Achtergrond"
          value={
            t.paper === 'white' ? '#ffffff' :
            t.paper === 'cream' ? '#fbf6e9' :
            t.paper === 'mint'  ? '#f0faf5' : '#13211a'
          }
          options={['#ffffff', '#fbf6e9', '#f0faf5', '#13211a']}
          onChange={(v) => {
            const m = { '#ffffff': 'white', '#fbf6e9': 'cream', '#f0faf5': 'mint', '#13211a': 'dark' };
            setTweak('paper', m[v] || 'white');
          }}
        />
        <TweakToggle
          label="Leesliniaal"
          value={t.ruler}
          onChange={(v) => setTweak('ruler', v)}
        />

        <TweakSection label="Interface"/>
        <TweakToggle
          label="OpenDyslexic UI"
          value={t.dyslexicUI}
          onChange={(v) => setTweak('dyslexicUI', v)}
        />
      </TweaksPanel>
    </>
  );
}

// Light placeholder pages for nav targets we won't fully build
function PlaceholderPage({ title, sub }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <p className="page-sub">{sub}</p>
      <div className="card card-pad-lg" style={{textAlign: 'center', padding: 80, color: 'var(--muted)'}}>
        <Icon name="layers" size={28} style={{opacity: 0.4}}/>
        <div style={{marginTop: 14, fontSize: 14}}>Dit scherm is nog in voorbereiding.</div>
      </div>
    </div>
  );
}

function StudentLibrary({ openReader }) {
  return (
    <div className="page">
      <h1>Bibliotheek</h1>
      <p className="page-sub">Oefenteksten, samenvattingen en eigen uploads.</p>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14}}>
        {[...STUDENT_TASKS, ...RECENT_DOCUMENTS].map((d, i) => (
          <div key={i} className="card card-pad" style={{cursor: 'pointer'}} onClick={() => openReader(d.id)}>
            <Pill tone="muted">{d.subject}</Pill>
            <div style={{fontFamily: 'var(--font-read)', fontWeight: 500, fontSize: 16, marginTop: 10, lineHeight: 1.3}}>{d.title}</div>
            <div style={{fontSize: 12, color: 'var(--muted)', marginTop: 8}}>
              {(d.minutes ?? 12)} min · {d.date || 'Beschikbaar'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StudentHistory({ openReader }) {
  return (
    <div className="page">
      <h1>Geschiedenis</h1>
      <p className="page-sub">Alles wat je deze maand hebt voorgelezen.</p>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Tekst</th><th>Vak</th><th>Leestijd</th><th>Datum</th><th></th></tr></thead>
          <tbody>
            {RECENT_DOCUMENTS.concat(RECENT_DOCUMENTS).map((d, i) => (
              <tr key={i}>
                <td><strong>{d.title}</strong></td>
                <td><span style={{color: 'var(--muted)'}}>{d.subject}</span></td>
                <td><span style={{color: 'var(--muted)'}}>{d.minutes} min</span></td>
                <td><span style={{color: 'var(--muted)'}}>{d.date}</span></td>
                <td style={{textAlign: 'right'}}>
                  <button className="btn btn-sm btn-ghost" onClick={() => openReader(d.id)}>
                    <Icon name="play" size={12}/> Opnieuw
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentSettings() {
  return (
    <div className="page" style={{maxWidth: 720}}>
      <h1>Mijn voorlees-instellingen</h1>
      <p className="page-sub">Deze instellingen zijn ook tijdens het lezen aan te passen via het Tweaks-paneel rechtsonder.</p>
      <div className="card card-pad-lg stack" style={{gap: 22}}>
        <div className="formfield">
          <label>Voorkeursstem (Nederlands)</label>
          <select defaultValue="lotte">
            <option value="lotte">Lotte — kalm, helder</option>
            <option value="daan">Daan — neutraal</option>
          </select>
        </div>
        <div className="formfield">
          <label>Voorkeursstem (Engels)</label>
          <select defaultValue="olivia">
            <option value="olivia">Olivia (UK)</option>
            <option value="aaron">Aaron (US)</option>
          </select>
        </div>
        <div className="formfield">
          <label>Standaard leessnelheid</label>
          <input type="range" min="0.5" max="1.75" step="0.05" defaultValue="0.95"/>
        </div>
        <div className="divider"></div>
        <div className="row-between">
          <div>
            <div style={{fontWeight: 500}}>Dyslexie-modus</div>
            <div style={{fontSize: 12.5, color: 'var(--muted)', marginTop: 2}}>OpenDyslexic-font, ruimere regels en woord-highlight aan</div>
          </div>
          <button className="btn btn-sm">Aan</button>
        </div>
        <div className="row-between">
          <div>
            <div style={{fontWeight: 500}}>Dyslexieverklaring</div>
            <div style={{fontSize: 12.5, color: 'var(--muted)', marginTop: 2}}>Geüpload door school · geldig t/m juni 2027</div>
          </div>
          <Pill tone="ok">Geverifieerd</Pill>
        </div>
      </div>
    </div>
  );
}

function AdminClasses() {
  return (
    <div className="page page-wide">
      <h1>Klassen</h1>
      <p className="page-sub">18 klassen, 612 leerlingen — automatisch gesynchroniseerd via Entree Federatie.</p>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Klas</th><th>Mentor</th><th>Leerlingen</th><th>Licenties</th><th>Actief gebruik</th><th></th></tr></thead>
          <tbody>
            {SCHOOL_CLASSES.map(c => (
              <tr key={c.id}>
                <td><strong>{c.code}</strong></td>
                <td><span style={{color: 'var(--muted)'}}>{c.mentor}</span></td>
                <td style={{fontVariantNumeric: 'tabular-nums'}}>{c.students}</td>
                <td style={{fontVariantNumeric: 'tabular-nums'}}>{c.licenties}</td>
                <td style={{minWidth: 200}}>
                  <div className="row" style={{gap: 10}}>
                    <div className="progress-bar" style={{flex: 1}}>
                      <div style={{width: `${(c.gebruikt / c.licenties) * 100}%`}}></div>
                    </div>
                    <div style={{fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 64}}>
                      {c.gebruikt} / {c.licenties}
                    </div>
                  </div>
                </td>
                <td style={{textAlign: 'right'}}>
                  <button className="btn btn-sm btn-ghost"><Icon name="more" size={14}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminLicenses() {
  return (
    <div className="page">
      <h1>Licenties</h1>
      <p className="page-sub">Beheer het aantal beschikbare en toegekende licenties.</p>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24}}>
        <Stat label="Totaal" value="750" sub="Schooljaar 25/26" accent="var(--primary)"/>
        <Stat label="In gebruik" value="612" sub="↗ 24 deze week"/>
        <Stat label="Beschikbaar" value="138" sub="Vrij toe te wijzen"/>
      </div>
      <div className="card card-pad-lg">
        <SectionHeader title="Verdeling" sub="Licenties per type abonnement"/>
        <div className="stack" style={{gap: 16}}>
          {[
            { naam: 'Volledig (alle vakken)', n: 412, kleur: 'var(--primary)' },
            { naam: 'Talen-pakket', n: 148, kleur: 'var(--accent)' },
            { naam: 'Examenjaar', n: 52, kleur: '#86efac' },
          ].map((p, i) => (
            <div key={i}>
              <div className="row-between" style={{marginBottom: 4}}>
                <span style={{fontSize: 13.5}}>{p.naam}</span>
                <span style={{fontSize: 12, color: 'var(--muted)'}}>{p.n} licenties</span>
              </div>
              <div className="progress-bar">
                <div style={{width: `${(p.n / 750) * 100}%`, background: p.kleur}}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
