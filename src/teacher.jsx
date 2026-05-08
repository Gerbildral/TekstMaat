// Docent screens: tests overview + uploader + students progress

const { useState: useStateT } = React;

function TeacherTests({ onOpenUploader }) {
  const counts = {
    klaar: ADMIN_DOCUMENTS.filter(t => t.status === 'klaargezet').length,
    controle: ADMIN_DOCUMENTS.filter(t => t.status === 'in-controle').length,
    concept: ADMIN_DOCUMENTS.filter(t => t.status === 'concept').length,
  };
  return (
    <div className="page page-wide">
      <div className="row-between" style={{marginBottom: 24}}>
        <div>
          <h1>Documenten</h1>
          <p className="page-sub">Documenten ingeleverd door docenten. Zet ze klaar voor leerlingen op het juiste moment.</p>
        </div>
        <div className="row" style={{gap: 8}}>
          <button className="btn">
            <Icon name="filter" size={14}/> Filter
          </button>
          <button className="btn btn-primary" onClick={onOpenUploader}>
            <Icon name="plus" size={14}/> Nieuw document
          </button>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24}}>
        <Stat label="Klaargezet"   value={counts.klaar}    sub="Beschikbaar voor leerlingen" accent="var(--primary)"/>
        <Stat label="In controle"  value={counts.controle} sub="Stem & opmaak checken"/>
        <Stat label="Ingeleverd"   value="3"               sub="Wachten op verwerking"/>
        <Stat label="Voorleestijd" value="234u"            sub="Deze week, alle leerlingen"/>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Document</th>
              <th>Ingeleverd door</th>
              <th>Klas</th>
              <th>Beschikbaar vanaf</th>
              <th>Stemprofiel</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ADMIN_DOCUMENTS.map(t => (
              <tr key={t.id}>
                <td>
                  <div style={{fontWeight: 500}}>{t.title}</div>
                  <div style={{fontSize: 12, color: 'var(--muted)'}}>{t.subject}</div>
                </td>
                <td><span style={{color: 'var(--muted)'}}>{t.indiener}</span></td>
                <td>{t.klas}</td>
                <td>{t.date}</td>
                <td><span style={{color: 'var(--muted)'}}>{t.voiceProfile}</span></td>
                <td>
                  {t.status === 'klaargezet' && <Pill tone="ok">Klaargezet</Pill>}
                  {t.status === 'in-controle' && <Pill tone="warn">In controle</Pill>}
                  {t.status === 'concept' && <Pill tone="draft">Concept</Pill>}
                  {t.status === 'afgerond' && <Pill tone="muted">Afgerond</Pill>}
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

function TeacherUploader({ onClose, onPublish }) {
  const [step, setStep] = useStateT(1);
  const [file, setFile] = useStateT(null);
  const [klas, setKlas] = useStateT('3 HAVO/VWO');
  const [voice, setVoice] = useStateT('nl-lotte');
  const [datetime, setDatetime] = useStateT('2026-05-09T13:30');
  const [perStudent, setPerStudent] = useStateT(true);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile({ name: f.name, size: f.size });
      setTimeout(() => setStep(2), 600);
    }
  };

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600}}>Nieuwe toets</div>
            <div style={{fontFamily: 'var(--font-read)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 2}}>
              Document klaarzetten
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icon name="plus" size={18} style={{transform: 'rotate(45deg)'}}/>
          </button>
        </div>

        <div className="modal-stepper">
          {['Document', 'Klas', 'Voorlezen', 'Klaarzetten'].map((label, i) => (
            <div key={i} className={'modal-step ' + (step === i + 1 ? 'active' : step > i + 1 ? 'done' : '')}>
              <div className="modal-step-num">{step > i + 1 ? <Icon name="check" size={12}/> : i + 1}</div>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="modal-body">
          {step === 1 && (
            <div>
              <h3 style={{margin: '0 0 4px', fontSize: 16}}>Upload het document</h3>
              <p style={{color: 'var(--muted)', fontSize: 13.5, margin: '0 0 16px'}}>
                PDF, Word of platte tekst. We zetten het automatisch om naar een voorleesbaar document met heldere structuur.
              </p>
              {!file ? (
                <label className="dropzone">
                  <input type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleFile} style={{display: 'none'}}/>
                  <Icon name="upload" size={28}/>
                  <div style={{fontWeight: 500, marginTop: 12}}>Sleep een bestand hier of klik om te uploaden</div>
                  <div style={{fontSize: 12, color: 'var(--muted)', marginTop: 4}}>
                    Maximaal 50 MB · PDF · DOCX · TXT
                  </div>
                </label>
              ) : (
                <div className="card card-pad" style={{borderColor: 'var(--accent-soft)', background: '#f0fdf6'}}>
                  <div className="row" style={{gap: 12}}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'var(--primary)', color: '#fff',
                      display: 'grid', placeItems: 'center'
                    }}>
                      <Icon name="fileText" size={16}/>
                    </div>
                    <div className="grow">
                      <div style={{fontWeight: 500}}>{file.name}</div>
                      <div style={{fontSize: 12, color: 'var(--muted)'}}>
                        Geanalyseerd · 4 paragrafen · 312 woorden · taal: Nederlands
                      </div>
                    </div>
                    <Pill tone="ok">Klaar</Pill>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 style={{margin: '0 0 4px', fontSize: 16}}>Voor welke klas?</h3>
              <p style={{color: 'var(--muted)', fontSize: 13.5, margin: '0 0 16px'}}>
                Kies een klas of selecteer specifieke leerlingen.
              </p>
              <div style={{display: 'grid', gap: 8}}>
                {SCHOOL_CLASSES.map(c => (
                  <label key={c.id} className={'pickrow ' + (klas === c.code ? 'pickrow-active' : '')}>
                    <input
                      type="radio" name="klas"
                      checked={klas === c.code}
                      onChange={() => setKlas(c.code)}
                      style={{accentColor: 'var(--primary)'}}
                    />
                    <div className="grow">
                      <div style={{fontWeight: 500}}>{c.code}</div>
                      <div style={{fontSize: 12, color: 'var(--muted)'}}>Mentor: {c.mentor} · {c.students} leerlingen</div>
                    </div>
                    <span style={{fontSize: 12, color: 'var(--muted)'}}>{c.gebruikt} actief</span>
                  </label>
                ))}
              </div>
              <div className="divider"></div>
              <label className="row" style={{gap: 8, fontSize: 13.5, color: 'var(--ink-2)'}}>
                <input type="checkbox" checked={perStudent} onChange={e => setPerStudent(e.target.checked)} style={{accentColor: 'var(--primary)'}}/>
                Per-leerling instellingen overnemen (snelheid, stem, lettertype)
              </label>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 style={{margin: '0 0 4px', fontSize: 16}}>Voorleesinstellingen</h3>
              <p style={{color: 'var(--muted)', fontSize: 13.5, margin: '0 0 16px'}}>
                Standaard voor de hele klas. Leerlingen kunnen dit per persoon aanpassen.
              </p>
              <div style={{display: 'grid', gap: 12}}>
                <div className="formfield">
                  <label>Stem</label>
                  <select value={voice} onChange={e => setVoice(e.target.value)}>
                    <option value="nl-lotte">Lotte (NL) — kalm, helder</option>
                    <option value="nl-daan">Daan (NL) — neutraal</option>
                    <option value="en-olivia">Olivia (UK)</option>
                    <option value="en-aaron">Aaron (US)</option>
                  </select>
                </div>
                <div className="formfield">
                  <label>Standaard snelheid</label>
                  <div className="row" style={{gap: 6}}>
                    {[0.75, 1.0, 1.25].map(r =>
                      <button key={r} type="button" className="btn btn-sm">{r}×</button>
                    )}
                  </div>
                </div>
                <div className="formfield">
                  <label>Highlight-stijl</label>
                  <div className="row" style={{gap: 6}}>
                    <button type="button" className="btn btn-sm btn-primary">Woord</button>
                    <button type="button" className="btn btn-sm">Zin</button>
                    <button type="button" className="btn btn-sm">Beide</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h3 style={{margin: '0 0 4px', fontSize: 16}}>Wanneer beschikbaar?</h3>
              <p style={{color: 'var(--muted)', fontSize: 13.5, margin: '0 0 16px'}}>
                Leerlingen zien de toets op het gekozen moment in hun dashboard.
              </p>
              <div className="formfield">
                <label>Datum en tijd</label>
                <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)}/>
              </div>
              <div className="card card-pad" style={{marginTop: 16, background: 'var(--surface-2)'}}>
                <div style={{fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600}}>Samenvatting</div>
                <div style={{fontSize: 13.5, lineHeight: 1.7}}>
                  <div><strong>{file?.name || 'document.pdf'}</strong></div>
                  <div>Klas: {klas} · {SCHOOL_CLASSES.find(c => c.code === klas)?.students || 28} leerlingen</div>
                  <div>Stem: {voice === 'nl-lotte' ? 'Lotte (NL)' : voice}</div>
                  <div>Beschikbaar vanaf: {datetime.replace('T', ' om ')}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <div className="row" style={{gap: 8}}>
            {step > 1 && <button className="btn" onClick={() => setStep(step - 1)}>Terug</button>}
            {step < 4
              ? <button className="btn btn-primary" disabled={step === 1 && !file} onClick={() => setStep(step + 1)}>
                  Volgende <Icon name="arrowRight" size={14}/>
                </button>
              : <button className="btn btn-primary" onClick={() => { onPublish(); onClose(); }}>
                  <Icon name="check" size={14}/> Klaarzetten
                </button>
            }
          </div>
        </div>

        <UploaderStyle/>
      </div>
    </div>
  );
}

function UploaderStyle() {
  return <style>{`
    .modal-wrap {
      position: fixed; inset: 0;
      background: rgba(15,31,23,.42);
      backdrop-filter: blur(4px);
      display: grid; place-items: center;
      z-index: 200;
      animation: modalIn .2s ease-out;
    }
    @keyframes modalIn { from { opacity: 0; } to { opacity: 1; } }
    .modal {
      width: min(640px, calc(100vw - 32px));
      max-height: calc(100vh - 48px);
      background: var(--surface);
      border-radius: 22px;
      box-shadow: 0 30px 80px -20px rgba(15,31,23,.3);
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .modal-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 22px 24px 16px;
    }
    .modal-stepper {
      display: flex; gap: 4px;
      padding: 0 24px 16px;
      border-bottom: 1px solid var(--border);
    }
    .modal-step {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 12.5px;
      color: var(--muted);
    }
    .modal-step-num {
      width: 18px; height: 18px; border-radius: 50%;
      display: grid; place-items: center;
      font-size: 11px; font-weight: 600;
      background: var(--bg); color: var(--muted);
      border: 1px solid var(--border);
    }
    .modal-step.active { background: var(--accent-soft); color: var(--primary); }
    .modal-step.active .modal-step-num { background: var(--primary); color: #fff; border-color: var(--primary); }
    .modal-step.done .modal-step-num { background: var(--accent); color: #fff; border-color: var(--accent); }
    .modal-step.done { color: var(--ink); }

    .modal-body {
      padding: 22px 24px;
      overflow-y: auto;
      flex: 1;
    }
    .modal-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
      background: var(--surface-2);
    }
    .dropzone {
      border: 2px dashed var(--border-strong);
      border-radius: 14px;
      padding: 40px 20px;
      text-align: center;
      display: flex; flex-direction: column; align-items: center;
      cursor: pointer;
      color: var(--muted);
      background: var(--surface-2);
      transition: border-color .15s, background .15s;
    }
    .dropzone:hover { border-color: var(--accent); background: #f0fdf6; color: var(--primary); }

    .pickrow {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      background: var(--surface);
    }
    .pickrow:hover { background: var(--surface-2); }
    .pickrow-active { border-color: var(--primary); background: #f0fdf6; }

    .formfield { display: flex; flex-direction: column; gap: 6px; }
    .formfield label { font-size: 12px; color: var(--muted); font-weight: 500; }
    .formfield input, .formfield select {
      padding: 9px 12px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--surface);
      font-size: 13.5px;
    }
  `}</style>;
}

function TeacherStudents() {
  const [filter, setFilter] = useStateT('all');
  const [q, setQ] = useStateT('');
  const filtered = TEACHER_STUDENTS.filter(s =>
    (filter === 'all' || (filter === 'dys' && s.dyslexie)) &&
    s.name.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="page page-wide">
      <div className="row-between" style={{marginBottom: 24}}>
        <div>
          <h1>Leerlingen</h1>
          <p className="page-sub">3 HAVO/VWO-A — 28 leerlingen, 18 met dyslexieverklaring</p>
        </div>
        <div className="row" style={{gap: 8}}>
          <div style={{position: 'relative'}}>
            <Icon name="search" size={14} style={{position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)'}}/>
            <input
              placeholder="Zoek leerling..."
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{
                padding: '8px 12px 8px 30px',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                fontSize: 13.5,
                width: 220,
                background: 'var(--surface)'
              }}
            />
          </div>
          <div className="role-switch" style={{borderRadius: 8}}>
            <button onClick={() => setFilter('all')} className={filter === 'all' ? 'active' : ''} style={{borderRadius: 6}}>Alle</button>
            <button onClick={() => setFilter('dys')} className={filter === 'dys' ? 'active' : ''} style={{borderRadius: 6}}>Dyslexie</button>
          </div>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 24}}>
        <Stat label="Voorleestijd" value="48u" sub="Deze week, 28 leerlingen"/>
        <Stat label="Toetsen voltooid" value="22 / 28" sub="Biologie H4"/>
        <Stat label="Gemiddelde snelheid" value="0.95×" sub="Verlaagd t.o.v. vorige week"/>
        <Stat label="Meest gebruikt" value="Lotte" sub="NL · kalm" accent="var(--primary)"/>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Leerling</th>
              <th>Klas</th>
              <th>Profiel</th>
              <th>Voorleestijd</th>
              <th>Voortgang H4</th>
              <th>Laatst actief</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td>
                  <div className="row" style={{gap: 10}}>
                    <Avatar name={s.name} size={28}/>
                    <div>
                      <div style={{fontWeight: 500}}>{s.name}</div>
                      {s.dyslexie && <div style={{fontSize: 11, color: 'var(--muted)'}}>Dyslexieverklaring</div>}
                    </div>
                  </div>
                </td>
                <td>{s.klas}</td>
                <td><span style={{color: 'var(--muted)', fontSize: 12.5}}>{s.profile}</span></td>
                <td style={{fontVariantNumeric: 'tabular-nums'}}>{s.voorleestijd}</td>
                <td style={{minWidth: 140}}>
                  <div className="row" style={{gap: 10}}>
                    <div className="progress-bar" style={{flex: 1}}>
                      <div style={{width: `${s.voortgang}%`}}></div>
                    </div>
                    <div style={{fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 32}}>{s.voortgang}%</div>
                  </div>
                </td>
                <td><span style={{color: 'var(--muted)'}}>{s.laatst}</span></td>
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

window.TeacherTests = TeacherTests;
window.TeacherUploader = TeacherUploader;
window.TeacherStudents = TeacherStudents;
