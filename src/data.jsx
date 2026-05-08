// Mock data for Tekstmaat

const SAMPLE_TEXTS = {
  bio: {
    id: 'bio',
    title: 'Biologie — Hoofdstuk 4: De cel',
    subject: 'Biologie',
    teacher: 'Klaargezet door dhr. Visser',
    due: 'beschikbaar vanaf 13:30',
    minutes: 12,
    lang: 'nl-NL',
    body: [
      "De cel is de kleinste levende eenheid van een organisme. Elke plant, elk dier en elke schimmel is opgebouwd uit een of meer cellen.",
      "Een cel bestaat uit verschillende onderdelen die elk hun eigen taak hebben. De celkern bevat het erfelijk materiaal en stuurt de cel aan.",
      "De mitochondriën zorgen voor de energievoorziening. Ze zetten voedingsstoffen om in een vorm van energie die de cel kan gebruiken.",
      "Het cytoplasma is een geleiachtige vloeistof waarin de organellen zweven. Hier vinden veel chemische reacties plaats.",
      "Plantencellen hebben een stevige celwand en bevatten bladgroenkorrels, waarin fotosynthese plaatsvindt. Dierlijke cellen hebben dat niet."
    ].join('\n\n')
  },
  geschiedenis: {
    id: 'geschiedenis',
    title: 'Geschiedenis — De Gouden Eeuw',
    subject: 'Geschiedenis',
    teacher: 'Klaargezet door dhr. Visser',
    due: 'beschikbaar morgen 09:00',
    minutes: 9,
    lang: 'nl-NL',
    body: [
      "De zeventiende eeuw wordt in Nederland vaak de Gouden Eeuw genoemd. In deze periode bloeide de handel, de wetenschap en de kunst.",
      "Amsterdam groeide uit tot een van de belangrijkste handelssteden van Europa. Schepen van de VOC voeren naar verre landen om specerijen, thee en zijde te halen.",
      "Tegelijkertijd had deze welvaart een donkere kant. Veel rijkdom werd verworven door slavenhandel en uitbuiting van koloniën.",
      "Schilders als Rembrandt en Vermeer maakten in deze tijd hun beroemdste werken. Hun stijl had veel invloed op de kunst in heel Europa."
    ].join('\n\n')
  },
  english: {
    id: 'english',
    title: 'English — Renewable energy',
    subject: 'Engels',
    teacher: 'Klaargezet door dhr. Visser',
    due: 'beschikbaar donderdag 11:00',
    minutes: 7,
    lang: 'en-GB',
    body: [
      "Renewable energy is energy that comes from natural sources which are replenished faster than they are consumed.",
      "Sunlight, wind, water and geothermal heat are common examples. They produce far less pollution than fossil fuels such as coal or gas.",
      "In the past decade, the price of solar panels has dropped dramatically. As a result, more households are installing them on their roofs.",
      "Wind turbines, both on land and at sea, now generate a significant share of electricity in many European countries."
    ].join('\n\n')
  }
};

const STUDENT_TASKS = [
  { id: ‘bio’,         title: ‘Biologie — Hoofdstuk 4: De cel’,           subject: ‘Biologie’,    teacher: ‘Klaargezet door mw. Van Dijk’, due: ‘Beschikbaar vanaf 13:30’, minutes: 12, urgent: true },
  { id: ‘geschiedenis’,title: ‘Geschiedenis — De Gouden Eeuw’,            subject: ‘Geschiedenis’, teacher: ‘Klaargezet door dhr. Bakker’,  due: ‘Morgen 09:00’,            minutes: 9 },
  { id: ‘english’,     title: ‘English — Renewable energy’,               subject: ‘Engels’,       teacher: ‘Klaargezet door ms. O\’Connor’,due: ‘Donderdag 11:00’,         minutes: 7 },
  { id: ‘ned-recensie’,title: ‘Nederlands — Boekfragment ‘Het smelt’’, subject: ‘Nederlands’, teacher: ‘Klaargezet door mw. Janssen’, due: ‘Vrijdag 15:00’,  minutes: 14 },
];

const RECENT_DOCUMENTS = [
  { id: 'doc-1', title: 'Begrijpend lezen — De wadlooptocht', subject: 'Nederlands', date: '2 mei', minutes: 18 },
  { id: 'doc-2', title: 'Aardrijkskunde — Klimaatzones', subject: 'Aardrijkskunde', date: '28 apr', minutes: 24 },
  { id: 'doc-3', title: 'Eigen upload — Samenvatting H6', subject: 'Persoonlijk', date: '26 apr', minutes: 12 },
];

const ADMIN_DOCUMENTS = [
  { id: 't-1', title: 'Biologie — H4: De cel',                indiener: 'mw. Van Dijk',    subject: 'Biologie',     klas: '3 HAVO/VWO', students: 28, ready: 28, status: 'klaargezet',  date: 'Vandaag 13:30',   voiceProfile: 'NL · Lotte (kalm)' },
  { id: 't-2', title: 'Geschiedenis — Gouden Eeuw',           indiener: 'dhr. Bakker',     subject: 'Geschiedenis', klas: '4 HAVO',     students: 24, ready: 22, status: 'in-controle', date: 'Morgen 09:00',    voiceProfile: 'NL · Daan' },
  { id: 't-3', title: 'English — Renewable energy',           indiener: 'ms. O\'Connor',   subject: 'Engels',       klas: '5 VWO',      students: 31, ready: 0,  status: 'in-controle', date: 'Donderdag 11:00', voiceProfile: 'EN-GB · Olivia' },
  { id: 't-5', title: 'Nederlands — Boekfragment ‘Het smelt’',indiener: 'mw. Janssen',     subject: 'Nederlands',   klas: '4 HAVO',     students: 24, ready: 24, status: 'klaargezet',  date: 'Vrijdag 15:00',   voiceProfile: 'NL · Lotte' },
  { id: 't-4', title: 'Aardrijkskunde — Klimaatzones',        indiener: 'dhr. Smit',       subject: 'Aardrijkskunde',klas: '2 HAVO',    students: 26, ready: 26, status: 'afgerond',    date: '28 apr',          voiceProfile: 'NL · Lotte' },
];

const TEACHER_STUDENTS = [
  { id: 's-1', name: 'Sara Boukhriss', klas: '3H', dyslexie: true, voorleestijd: '4u 12m', laatst: 'vandaag', voortgang: 78, profile: 'Woord · 0.9× · Lotte' },
  { id: 's-2', name: 'Liam de Vries', klas: '3H', dyslexie: true, voorleestijd: '6u 48m', laatst: 'vandaag', voortgang: 92, profile: 'Zin · 1.0× · Daan' },
  { id: 's-3', name: 'Yusuf Yıldız', klas: '3H', dyslexie: false, voorleestijd: '1u 04m', laatst: 'gisteren', voortgang: 65, profile: 'Woord · 1.1× · Lotte' },
  { id: 's-4', name: 'Eva Hendriks', klas: '3H', dyslexie: true, voorleestijd: '5u 33m', laatst: 'vandaag', voortgang: 88, profile: 'Woord · 0.85× · Lotte · OpenDyslexic' },
  { id: 's-5', name: 'Tijn van Loon', klas: '3H', dyslexie: false, voorleestijd: '0u 38m', laatst: '3 dagen', voortgang: 41, profile: 'Zin · 1.0× · Daan' },
  { id: 's-6', name: 'Noor el Idrissi', klas: '3H', dyslexie: true, voorleestijd: '3u 22m', laatst: 'vandaag', voortgang: 71, profile: 'Woord · 0.9× · Lotte' },
];

const SCHOOL_CLASSES = [
  { id: 'c-1', code: '1H-A', mentor: 'mw. Aydın', students: 28, licenties: 28, gebruikt: 19 },
  { id: 'c-2', code: '2H-B', mentor: 'dhr. Smit', students: 26, licenties: 26, gebruikt: 14 },
  { id: 'c-3', code: '3H/V-A', mentor: 'mw. Van Dijk', students: 28, licenties: 28, gebruikt: 22 },
  { id: 'c-4', code: '3H/V-B', mentor: 'dhr. Bakker', students: 27, licenties: 27, gebruikt: 18 },
  { id: 'c-5', code: '4 HAVO', mentor: 'mw. Janssen', students: 24, licenties: 24, gebruikt: 21 },
  { id: 'c-6', code: '5 VWO', mentor: 'dhr. El Amrani', students: 31, licenties: 31, gebruikt: 26 },
];

const SSO_INTEGRATIONS = [
  { id: 'entree', name: 'Entree Federatie', vendor: 'Kennisnet', status: 'verbonden', users: 612, lastSync: '12 minuten geleden', desc: 'SAML 2.0 — automatische klassen-sync via Kennisnet Federatie' },
  { id: 'ms365', name: 'Microsoft 365 / Teams', vendor: 'Microsoft', status: 'verbonden', users: 612, lastSync: '4 minuten geleden', desc: 'OAuth 2.0 — leerlingen loggen in met hun school-account' },
  { id: 'magister', name: 'Magister', vendor: 'Iddink Group', status: 'beschikbaar', users: 0, lastSync: '—', desc: 'Cijfers en klassenroosters synchroniseren (optioneel)' },
  { id: 'somtoday', name: 'Somtoday', vendor: 'Topicus', status: 'beschikbaar', users: 0, lastSync: '—', desc: 'Leerlingadministratie en absenties' },
  { id: 'gws', name: 'Google Workspace', vendor: 'Google', status: 'beschikbaar', users: 0, lastSync: '—', desc: 'OAuth 2.0 voor scholen op Google for Education' },
];

const SCHOOL_USAGE_WEEK = [
  // hours per day, mon-sun
  { day: 'Ma', hours: 38 },
  { day: 'Di', hours: 52 },
  { day: 'Wo', hours: 27 },
  { day: 'Do', hours: 61 },
  { day: 'Vr', hours: 44 },
  { day: 'Za', hours: 8 },
  { day: 'Zo', hours: 4 },
];

Object.assign(window, {
  SAMPLE_TEXTS, STUDENT_TASKS, RECENT_DOCUMENTS,
  ADMIN_DOCUMENTS, TEACHER_STUDENTS,
  SCHOOL_CLASSES, SSO_INTEGRATIONS, SCHOOL_USAGE_WEEK
});
