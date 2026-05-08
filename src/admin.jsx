// School admin: portal met klassen, leerlingen, licenties + SSO

const { useState: useStateA } = React;

function AdminOverview({ onOpenUploader }) {
  return (
    <div className="page page-wide">
      <div className="row-between" style={{marginBottom: 24}}>
        <div>
          <h1>Christelijk Lyceum De Maas</h1>
          <p className="page-sub">612 leerlingen actief · 18 klassen · 2 koppelingen verbonden</p>
        </div>
        <div className="row" style={{gap: 8}}>
          <button className="btn"><Icon name="download" size={14}/> Export</button>
          <button className="btn btn-primary" onClick={onOpenUploader}><Icon name="plus" size={14}/> Nieuw document</button>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24}}>
        <Stat label="Actieve leerlingen" value="612" sub="↗ 24 deze week" accent="var(--primary)"/>
        <Stat label="Voorleestijd" value="234u" sub="Deze week, alle klassen"/>
        <Stat label="Licenties gebruikt" value="612 / 750" sub="138 beschikbaar"/>
        <Stat label="Toetsen klaargezet" value="47" sub="Komende 7 dagen"/>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 24}}>
        <div className="card card-pad-lg">
          <SectionHeader
            title="Gebruik per dag"
            sub="Voorleestijd in uren, alle leerlingen"
            action={<Pill tone="ok">Donderdag piek</Pill>}
          />
          <Sparkbar data={SCHOOL_USAGE_WEEK} height={120}/>
        </div>

        <div className="card card-pad-lg">
          <SectionHeader title="Top vakken"/>
          <div className="stack" style={{gap: 14}}>
            {[
              { vak: 'Nederlands', uren: 64 },
              { vak: 'Engels', uren: 51 },
              { vak: 'Geschiedenis', uren: 38 },
              { vak: 'Biologie', uren: 32 },
              { vak: 'Aardrijkskunde', uren: 22 },
            ].map((v, i) => (
              <div key={i}>
                <div className="row-between" style={{marginBottom: 4}}>
                  <span style={{fontSize: 13.5}}>{v.vak}</span>
                  <span style={{fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums'}}>{v.uren}u</span>
                </div>
                <div className="progress-bar">
                  <div style={{width: `${(v.uren / 64) * 100}%`}}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SectionHeader
        title="Klassen"
        sub="Activeer of pauzeer per klas, beheer mentoren"
        action={<button className="btn btn-sm">Klas-instellingen</button>}
      />
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Klas</th>
              <th>Mentor</th>
              <th>Leerlingen</th>
              <th>Licenties</th>
              <th>Actief gebruik</th>
              <th></th>
            </tr>
          </thead>
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

function AdminIntegrations() {
  const [setupOpen, setSetupOpen] = useStateA(null);
  return (
    <div className="page page-wide">
      <div className="row-between" style={{marginBottom: 24}}>
        <div>
          <h1>Koppelingen</h1>
          <p className="page-sub">SSO en automatische synchronisatie van leerlingen, klassen en docenten.</p>
        </div>
        <button className="btn"><Icon name="refresh" size={14}/> Synchroniseer nu</button>
      </div>

      <div className="card card-pad-lg" style={{marginBottom: 24, background: 'linear-gradient(135deg, #f0fdf6 0%, #fbfcfb 70%)', borderColor: 'var(--accent-soft)'}}>
        <div className="row" style={{gap: 16}}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--primary)', color: '#fff',
            display: 'grid', placeItems: 'center'
          }}>
            <Icon name="shield" size={22}/>
          </div>
          <div className="grow">
            <div style={{fontWeight: 600, fontSize: 15}}>Single Sign-On is actief via Entree Federatie</div>
            <div style={{fontSize: 13, color: 'var(--muted)', marginTop: 2}}>
              Leerlingen loggen in met hun school-account. 612 accounts gesynchroniseerd, laatste sync 12 minuten geleden.
            </div>
          </div>
          <Pill tone="ok">Verbonden</Pill>
        </div>
      </div>

      <SectionHeader title="Beschikbare koppelingen"/>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14}}>
        {SSO_INTEGRATIONS.map(s => (
          <div key={s.id} className="card card-pad" style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            <div className="row-between">
              <div className="row" style={{gap: 12}}>
                <div className="integration-logo" data-id={s.id}>
                  {logoFor(s.id)}
                </div>
                <div>
                  <div style={{fontWeight: 500, fontSize: 14}}>{s.name}</div>
                  <div style={{fontSize: 12, color: 'var(--muted)'}}>{s.vendor}</div>
                </div>
              </div>
              {s.status === 'verbonden'
                ? <Pill tone="ok">Verbonden</Pill>
                : <Pill tone="muted">Niet verbonden</Pill>}
            </div>
            <p style={{fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5}}>{s.desc}</p>

            {s.status === 'verbonden' ? (
              <div className="row-between" style={{
                padding: '10px 12px',
                background: 'var(--surface-2)',
                borderRadius: 10,
                fontSize: 12.5
              }}>
                <span><strong style={{fontVariantNumeric: 'tabular-nums'}}>{s.users}</strong> <span style={{color: 'var(--muted)'}}>gesynchroniseerd</span></span>
                <span style={{color: 'var(--muted)'}}>Laatste sync: {s.lastSync}</span>
              </div>
            ) : null}

            <div className="row" style={{gap: 8, marginTop: 4}}>
              {s.status === 'verbonden'
                ? <>
                    <button className="btn btn-sm">Instellingen</button>
                    <button className="btn btn-sm btn-ghost"><Icon name="refresh" size={12}/> Sync nu</button>
                  </>
                : <button className="btn btn-sm btn-primary" onClick={() => setSetupOpen(s)}>
                    Verbinden <Icon name="arrowRight" size={12}/>
                  </button>}
            </div>
          </div>
        ))}
      </div>

      {setupOpen && <SsoSetup integration={setupOpen} onClose={() => setSetupOpen(null)}/>}
    </div>
  );
}

function logoFor(id) {
  const wrap = (children, bg = '#0f1f17') => (
    <div style={{
      width: 38, height: 38, borderRadius: 9,
      background: bg, color: '#fff',
      display: 'grid', placeItems: 'center',
      fontFamily: 'var(--font-read)', fontWeight: 600, fontSize: 16
    }}>{children}</div>
  );
  switch (id) {
    case 'entree':
      return wrap(<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 3l8 5v8l-8 5-8-5V8l8-5z"/><path d="M8 11h8"/></svg>, '#1f4d8b');
    case 'ms365':
      return wrap(
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, width: 18, height: 18}}>
          <div style={{background: '#f25022'}}></div>
          <div style={{background: '#7fba00'}}></div>
          <div style={{background: '#00a4ef'}}></div>
          <div style={{background: '#ffb900'}}></div>
        </div>, '#fff');
    case 'magister':
      return wrap('M', '#005ea2');
    case 'somtoday':
      return wrap('S', '#e2003c');
    case 'gws':
      return wrap('G', '#4285f4');
    default: return wrap('?');
  }
}

function SsoSetup({ integration, onClose }) {
  const [step, setStep] = useStateA(1);
  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="row" style={{gap: 12}}>
            <div className="integration-logo">{logoFor(integration.id)}</div>
            <div>
              <div style={{fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600}}>Koppeling instellen</div>
              <div style={{fontFamily: 'var(--font-read)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 2}}>
                Verbinden met {integration.name}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icon name="plus" size={18} style={{transform: 'rotate(45deg)'}}/>
          </button>
        </div>

        <div className="modal-stepper">
          {['Aanvraag', 'Authenticatie', 'Mapping', 'Klaar'].map((label, i) => (
            <div key={i} className={'modal-step ' + (step === i + 1 ? 'active' : step > i + 1 ? 'done' : '')}>
              <div className="modal-step-num">{step > i + 1 ? <Icon name="check" size={12}/> : i + 1}</div>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="modal-body">
          {step === 1 && (
            <div className="stack">
              <h3 style={{margin: 0, fontSize: 16}}>Vraag toegang aan bij {integration.vendor}</h3>
              <p style={{color: 'var(--muted)', fontSize: 13.5, margin: 0}}>
                Geef ons de benodigde gegevens van uw schoolbestuur. Wij nemen contact op met de leverancier voor goedkeuring.
              </p>
              <div className="formfield">
                <label>BRIN-nummer</label>
                <input defaultValue="00ZZ"/>
              </div>
              <div className="formfield">
                <label>Bestuur</label>
                <input defaultValue="Stichting Maasonderwijs"/>
              </div>
              <div className="formfield">
                <label>Contactpersoon ICT</label>
                <input defaultValue="ict@demaas.nl"/>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="stack">
              <h3 style={{margin: 0, fontSize: 16}}>Authenticeer met {integration.vendor}</h3>
              <p style={{color: 'var(--muted)', fontSize: 13.5, margin: 0}}>
                U wordt doorverwezen naar {integration.vendor} om in te loggen als beheerder en toestemming te geven.
              </p>
              <div className="card card-pad" style={{background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 14}}>
                <div className="integration-logo">{logoFor(integration.id)}</div>
                <div className="grow">
                  <div style={{fontSize: 13, fontWeight: 500}}>{integration.name}</div>
                  <div style={{fontSize: 12, color: 'var(--muted)'}}>SAML 2.0 · Single Sign-On</div>
                </div>
                <button className="btn btn-primary btn-sm">
                  <Icon name="external" size={12}/> Inloggen
                </button>
              </div>
              <div style={{fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0'}}>
                ✓ Wachtend op authenticatie...
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="stack">
              <h3 style={{margin: 0, fontSize: 16}}>Velden koppelen</h3>
              <p style={{color: 'var(--muted)', fontSize: 13.5, margin: 0}}>
                Welke gegevens wilt u synchroniseren?
              </p>
              <div className="stack" style={{gap: 8}}>
                {[
                  { label: 'Leerlingen (naam, e-mail)', def: true },
                  { label: 'Klassen + mentor', def: true },
                  { label: 'Docenten + rechten', def: true },
                  { label: 'Dyslexieverklaring', def: false },
                  { label: 'Cijfers (read-only)', def: false },
                ].map((m, i) => (
                  <label key={i} className="row" style={{
                    gap: 10, padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 10, cursor: 'pointer'
                  }}>
                    <input type="checkbox" defaultChecked={m.def} style={{accentColor: 'var(--primary)'}}/>
                    <span style={{fontSize: 13.5}}>{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {step === 4 && (
            <div style={{textAlign: 'center', padding: '20px 0'}}>
              <div style={{
                width: 64, height: 64, borderRadius: 999, background: 'var(--accent-soft)',
                display: 'grid', placeItems: 'center', margin: '0 auto 16px',
                color: 'var(--primary)'
              }}>
                <Icon name="check" size={28}/>
              </div>
              <div style={{fontFamily: 'var(--font-read)', fontSize: 22, fontWeight: 500, marginBottom: 4}}>
                Verbonden!
              </div>
              <div style={{color: 'var(--muted)', fontSize: 13.5}}>
                Eerste synchronisatie loopt op de achtergrond. Dit kan tot 30 minuten duren voor grote scholen.
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Sluiten</button>
          <div className="row" style={{gap: 8}}>
            {step > 1 && step < 4 && <button className="btn" onClick={() => setStep(step - 1)}>Terug</button>}
            {step < 4
              ? <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
                  Volgende <Icon name="arrowRight" size={14}/>
                </button>
              : <button className="btn btn-primary" onClick={onClose}>Naar overzicht</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

window.AdminOverview = AdminOverview;
window.AdminIntegrations = AdminIntegrations;
