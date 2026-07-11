/* ADcelerate by Admira — datos mock compartidos (v2, tesis inside-out).
   La publicidad geo-contextual, desde DENTRO del circuito.
   El referente del mercado actúa desde fuera (data lake telco+SDKs); Admira ES el soporte:
   detecta audiencia en la propia pantalla → activa en el propio circuito → mide en el propio punto. */
window.AC = window.AC || {};

/* ── Base instalada (números de la base real, verosímiles) ───────────── */
AC.base = {
  pantallas:   '40.000+',
  proyectos:   '250',
  puntos:      '12.000+',
  ciudades:    '90+'
};

/* ── Comparativa outside-in vs inside-out ────────────────────────────── */
AC.tesis = {
  outside: {
    tag: 'El referente del mercado · outside-in',
    title: 'Desde FUERA del soporte',
    rows: [
      'Data lake alquilado: telco + SDKs de terceros (21M dispositivos móviles).',
      'Infiere la audiencia del entorno por señales del móvil, fuera de la pantalla.',
      'Compra inventario DOOH a través de intermediarios y exchanges.',
      'Mide drive-to-store con paneles de movilidad externos.',
      'La marca no controla ni el dato ni el soporte: los alquila.'
    ]
  },
  inside: {
    tag: 'ADcelerate by Admira · inside-out',
    title: 'Desde DENTRO del circuito',
    rows: [
      'First-party: la audiencia se detecta en la PROPIA pantalla (Analytics en el punto).',
      'Sin cookies, sin data lake alquilado, sin SDKs de terceros.',
      'Activa la campaña en el PROPIO circuito — 40.000+ pantallas, player propio.',
      'Mide drive-to-store en el PROPIO punto de venta, no en paneles externos.',
      'La marca controla dato, soporte y medición de punta a punta.'
    ]
  }
};

/* ── Geoaudiencias first-party por tipo de punto (mock verosímil) ────── */
AC.zonas = [
  { id:'estanco-centro',  tipo:'Estanco',          nombre:'Estanco · Gran Vía, Madrid',
    dispositivos: 3120, franja:'mañana', perfil:'Adulto 35-64 · fumador · trayecto trabajo',
    x:34, y:41, uplift:'+18%' },
  { id:'kiosco-sol',      tipo:'Kiosco',           nombre:'Kiosco · Puerta del Sol, Madrid',
    dispositivos: 5840, franja:'mediodía', perfil:'Turista + local · alto tránsito peatonal',
    x:52, y:47, uplift:'+22%' },
  { id:'cc-diagonal',     tipo:'Centro comercial', nombre:'C.C. · L’Illa Diagonal, Barcelona',
    dispositivos: 9210, franja:'tarde', perfil:'Familias · 25-49 · poder adquisitivo medio-alto',
    x:70, y:33, uplift:'+27%' },
  { id:'estanco-ruzafa',  tipo:'Estanco',          nombre:'Estanco · Ruzafa, Valencia',
    dispositivos: 1780, franja:'tarde', perfil:'Joven urbano 25-40 · ocio nocturno',
    x:61, y:66, uplift:'+15%' },
  { id:'kiosco-triana',   tipo:'Kiosco',           nombre:'Kiosco · Triana, Sevilla',
    dispositivos: 2340, franja:'mañana', perfil:'Residente barrio · prensa + lotería',
    x:26, y:71, uplift:'+14%' },
  { id:'cc-mallorca',     tipo:'Centro comercial', nombre:'C.C. · Porto Pi, Mallorca',
    dispositivos: 4160, franja:'tarde', perfil:'Turismo + local · estacional alto verano',
    x:82, y:58, uplift:'+21%' }
];

/* Perfiles agregados por tipología de punto (para el explorador). */
AC.perfiles = [
  { tipo:'Estanco',          icon:'🚬', edad:'35-64', genero:'70% H · 30% M', top:'Tabaco, lotería, prensa', franja:'Mañana / mediodía' },
  { tipo:'Kiosco',           icon:'📰', edad:'25-55', genero:'55% H · 45% M', top:'Prensa, bebidas, snacking', franja:'Todo el día' },
  { tipo:'Centro comercial', icon:'🛍️', edad:'25-49', genero:'40% H · 60% M', top:'Moda, restauración, ocio', franja:'Tarde / fin de semana' }
];

/* ── Circuito: inventario de pantallas donde aterriza la campaña ─────── */
AC.screens = [
  { name: 'DOOH-01', loc: 'Estanco · Gran Vía · Madrid',     status: 'ok',   app: 'Campaña activa' },
  { name: 'DOOH-02', loc: 'Kiosco · Puerta del Sol · Madrid', status: 'ok',  app: 'Campaña activa' },
  { name: 'DOOH-03', loc: 'C.C. L’Illa Diagonal · Barcelona', status: 'ok',  app: 'Campaña activa' },
  { name: 'DOOH-04', loc: 'Estanco · Ruzafa · Valencia',      status: 'warn', app: 'Sincronizando…' },
  { name: 'DOOH-05', loc: 'Kiosco · Triana · Sevilla',        status: 'ok',   app: 'Campaña activa' },
  { name: 'DOOH-06', loc: 'C.C. Porto Pi · Mallorca',         status: 'ok',   app: 'Campaña activa' },
  { name: 'DOOH-07', loc: 'Estanco · Callao · Madrid',        status: 'off',  app: '—' },
  { name: 'DOOH-08', loc: 'Kiosco · Colón · Valencia',        status: 'ok',   app: 'Campaña activa' }
];

/* ── Ejemplos de brief para el flujo de Activación ───────────────────── */
AC.prompts = [
  'Quiero impactar a adultos fumadores en trayecto de trabajo en el centro de Madrid por las mañanas, para lanzar una marca de tabaco calentado.',
  'Campaña de bebida energética para público joven urbano en zonas de ocio de Valencia y Sevilla, franja de tarde-noche.',
  'Lanzamiento de moda para familias con poder adquisitivo medio-alto en centros comerciales de Barcelona los fines de semana.',
  'Drive-to-store para una farmacia: impactar a mayores de 50 cerca de estancos y kioscos de barrio por la mañana.'
];

/* ── Catálogo de creatividades por objetivo (mock) ───────────────────── */
AC.creatividades = [
  { key:'awareness', label:'Notoriedad', copy:'Vídeo 10s full-screen + logo persistente' },
  { key:'promo',     label:'Promoción',  copy:'Oferta destacada + código QR a landing' },
  { key:'d2s',       label:'Drive-to-store', copy:'“A 200 m” + flecha + horario del punto' },
  { key:'launch',    label:'Lanzamiento', copy:'Countdown + hero del producto + claim' }
];
