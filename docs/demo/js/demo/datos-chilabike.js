// Datos de ejemplo del demo de Grupo A.M, los negocios de Javi (unaria.mx/demo/?demo=chilabike): Chilabike, Curandero (Loyverse, en
// js/demo/datos-loyverse.js), Lattico (sin Loyverse todavía) y Casa María (en preparación).
// Chilabike: Todo es inventado y se acomoda a la fecha de hoy.
// Fase 1: los mensajes de WhatsApp, Instagram y Facebook caen en una sola bandeja; los anuncios de Meta llevan directo
// a un mensaje y cada conversación trae de qué anuncio vino; las solicitudes de evento se vuelven fichas en el calendario.
// Lo que alguien manda en la página de eventos del demo (unaria.mx/demo/chilabike/) se guarda en este navegador
// (localStorage "chilabike-demo-solicitudes") y aquí se agrega como evento nuevo.
(function () {
  'use strict';
  const COLOR = '#C9500C';
  window.__MARCA = {
    demo: true, contacto: 'Monterrey, N.L.', asistente: false,
    nombre: 'Grupo A.M', marca: ['Grupo A.M'], logos: [],
    color: COLOR, color2: '#A8430A', colorSuave: '#FDEBDD',
    // Un solo sistema para todos sus negocios: cada uno es una opción del menú y adentro vive su mundo
    menuGeneral: [{ id: 'resumen' }],
    negocios: [
      { id: 'chilabike', nombre: 'Chilabike', giro: 'Chilaquiles · eventos y domicilio', inicial: 'Ch', color: '#C9500C', empresa_id: 'emp-chb',
        modulos: ['bandeja', 'eventos', 'anuncios'], titulos: { bandeja: 'Mensajes' } },
      { id: 'curandero', nombre: 'Curandero', giro: 'Café y pan · Mitras', inicial: 'Cu', empresa_id: 'emp-cur', modulos: ['ventas'],
        // Manual de identidad (Uncommon Studio): #2e3526 · #697148 · #D1C9B3; letras King Graphics y Bicyclette
        color: '#697148', color2: '#2e3526', colorSuave: '#ECE8DC', colorFondo: '#697148', colorTinta: '#D1C9B3', isotipo: 'img/clientes/curandero-isotipo.svg' },
      { id: 'lattico', nombre: 'Lattico', giro: 'Por conectar', inicial: 'La', color: '#6B4FA0', empresa_id: 'emp-lat', modulos: ['ventas'],
        notaLoyverse: 'Lattico todavía no tiene Loyverse. En cuanto lo contrate, aquí se conecta con su propio token y sus ventas quedan separadas de las de Curandero.' },
      { id: 'casamaria', nombre: 'Casa María', giro: 'Rentas', inicial: 'CM', color: '#8A6D1F', empresa_id: 'emp-cm', modulos: ['preparacion'],
        titulos: { preparacion: 'Rentas y plano' }, pendiente: 'Falta el plano y la lista de rentas',
        preparacion: { titulo: 'Casa María: rentas y plano', texto: 'Aquí va a vivir todo lo de la casa: el plano final y la administración de sus rentas.',
          va: ['El plano de la casa con cada espacio que se renta', 'Inquilinos, contratos y fechas de vencimiento', 'Cobro de la renta de cada mes: quién pagó, quién debe y recibos', 'Gastos de la casa y lo que deja cada mes'],
          falta: ['El plano final (PDF o foto)', 'La lista de lo que se renta: espacio, inquilino, renta, día de pago y depósito'] } },
    ],
    ajustes: ['usuarios'],
    chilabike: {
      negocio: 'Chilabike', dueno: 'Javi', pagina: './chilabike/',
      sucursales: ['San Pedro', 'San Jerónimo', 'Mitras', 'San Pedro de Pinta', 'Cumbres', 'Centro', 'Venustiano Carranza', 'Tec'],
      tipos: ['Cumpleaños', 'Boda o XV', 'Desayuno de oficina', 'Reunión', 'Festival', 'Otro'],
      paquetes: ['Desayuno de oficina', 'Fiesta', 'Tornafiesta'],
    },
  };

  window.__DEMO_DATOS = function () {
    const ORG = 'org-chb';
    let n = 0;
    const id = (p) => `${p}-${String(++n).padStart(4, '0')}`;
    const AHORA = Date.now();
    const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const HOY = new Date(); HOY.setHours(12, 0, 0, 0);
    const dia = (k) => { const d = new Date(HOY); d.setDate(d.getDate() + k); return iso(d); };
    // un sábado o domingo cerca de "k" días (los eventos suelen ser en fin de semana)
    const finde = (k, domingo = false) => { const d = new Date(HOY); d.setDate(d.getDate() + k); while (d.getDay() !== (domingo ? 0 : 6)) d.setDate(d.getDate() + 1); return iso(d); };
    const hace = (min) => new Date(AHORA - min * 60e3).toISOString();

    // ---------- anuncios (Meta lleva directo al mensaje; Google, a la página) ----------
    const anuncios = [
      { id: 'ad-bodas', nombre: 'Bodas y XV · tornafiesta', plataforma: 'Instagram', destino: 'WhatsApp', inicio: dia(-21), inversion: 14500, previas: 41, activo: true },
      { id: 'ad-posadas', nombre: 'Posadas de empresa', plataforma: 'Facebook', destino: 'Messenger', inicio: dia(-12), inversion: 9800, previas: 19, activo: true },
      { id: 'ad-cumple', nombre: 'Tu cumple con Chilabike', plataforma: 'Instagram', destino: 'Mensaje de Instagram', inicio: dia(-30), inversion: 7200, previas: 52, activo: true },
      { id: 'ad-google', nombre: 'Google · eventos Monterrey', plataforma: 'Google', destino: 'Página de eventos', inicio: dia(-18), inversion: 6500, previas: 14, activo: true },
    ];

    // ---------- conversaciones (en el tono de Chilabike) ----------
    const conversaciones = [], mensajes = [], eventos = [];
    const C = (o, hilo) => {
      const c = { id: id('conv'), org_id: ORG, estado: 'abierta', leida: false, ...o };
      let t = o.hace;
      hilo.forEach(([de, texto, gap = 2]) => { mensajes.push({ id: id('msg'), org_id: ORG, conversacion_id: c.id, de, texto, creado_en: hace(t) }); t = Math.max(0, t - gap); });
      c.ultimo_en = mensajes[mensajes.length - 1].creado_en;
      c.ultimo = hilo[hilo.length - 1][1];
      c.por_contestar = hilo[hilo.length - 1][0] === 'cliente';
      delete c.hace; conversaciones.push(c); return c;
    };

    const fBoda = finde(38), fCumple = finde(16), fPosada = (() => { const d = new Date(finde(36) + 'T12:00:00'); d.setDate(d.getDate() - 1); return iso(d); })(), fExa = finde(23), fBodaAna = finde(52);

    const cMariana = C({ canal: 'whatsapp', contacto: 'Mariana Treviño', sugerida: 'Va, un tornafiesta de 180 queda perfecto con el paquete Tornafiesta: llegamos a la 1 con cajitas calientitas de mixtos y las salsas aparte para tu tía 😅 Sale en $[__] por persona. Para apartar la fecha es un anticipo del [__]%. ¿Te paso los datos?', telefono: '8117246630', anuncio_id: 'ad-bodas', etiqueta: 'evento', hace: 26,
      extraccion: { tipo: 'Boda o XV', fecha: fBoda, hora: '01:00', personas: 180, direccion: 'Quinta Los Encinos, Santiago', paquete: 'Tornafiesta', sucursal: 'San Pedro',
        notas: 'Tornafiesta de la boda de su hermana. Quiere mixtos y salsas aparte para los que no aguantan picante.' } }, [
      ['cliente', 'Hola!! vi su anuncio en insta 😍 quiero cotizar sus cajitas para el tornafiesta de la boda de mi hermana', 3],
      ['javi', 'Qué onda Mariana! Claro que sí, a grilear 🙌 ¿Para qué fecha y cuántos serían?', 4],
      ['cliente', `El ${new Date(fBoda + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}, somos como 180 personas. Es en la Quinta Los Encinos en Santiago`, 3],
      ['cliente', 'Sería como a la 1 de la mañana. Los queremos mixtos, ¿cuánto sale por persona?', 2],
      ['cliente', 'Ah y si pueden llevar las salsas aparte, mi tía no aguanta nada de picante jaja', 0],
    ]);
    const cDani = C({ canal: 'instagram', contacto: '@dani.glzz', sugerida: 'Holaa! Para 40 personas te queda el paquete Fiesta: estación con las 3 salsas y barra de toppings, en $[__] por persona. Sí hay vegetariano, la proteína es a elección 🌱 ¿Te aparto el sábado?', anuncio_id: 'ad-cumple', etiqueta: 'evento', hace: 48,
      extraccion: { tipo: 'Cumpleaños', fecha: fCumple, hora: '11:00', personas: 40, direccion: 'Casa en Cumbres 5° Sector', paquete: 'Fiesta', sucursal: 'Cumbres', notas: 'Brunch de cumpleaños 30. Pregunta por opción vegetariana (proteína a elección).' } }, [
      ['cliente', 'holaaa cuánto cuesta para un cumple de 40 personas?', 1],
      ['cliente', `es un brunch el sábado ${new Date(fCumple + 'T12:00:00').getDate()} en mi casa en cumbres, como a las 11`, 1],
      ['cliente', 'y tienen algo vegetariano? 🥲', 0],
    ]);
    const cCarlos = C({ canal: 'facebook', contacto: 'Carlos Medina', sugerida: 'Carlos, ya le mandé la cotización a su correo. Si le parece, con el anticipo le aparto el viernes a las 9 am. Cualquier duda aquí estoy.', anuncio_id: 'ad-posadas', etiqueta: 'evento', hace: 60 * 26, leida: true }, [
      ['cliente', 'Buenas tardes, soy de Recursos Humanos de Grupo Industrial Norte. Queremos cotizar chilaquiles en cajita para el desayuno de la posada.', 6],
      ['javi', '¡Buenas tardes Carlos! Con gusto. ¿Cuántas personas serían y dónde?', 10],
      ['cliente', `Somos 120, en nuestras oficinas de Valle Oriente, el viernes ${new Date(fPosada + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })} a las 9 am. Necesitamos factura.`, 15],
      ['javi', 'Perfecto. Para empresas está el Desayuno de oficina: cajita de verdes, rojos o mixtos con proteína y bebida, entregado a la hora que nos diga, con factura. Le mando la cotización por correo hoy mismo 📄', 30],
      ['cliente', 'Excelente, quedo atento.', 0],
    ]);
    const cSofia = C({ canal: 'whatsapp', contacto: 'Sofía Garza', sugerida: 'Hola Sofía! Claro, las mandamos desde San Jerónimo. Son 3 cajitas de rojos con pollo y 1 de verdes, $[__] más envío. ¿A qué dirección te las llevamos?', telefono: '8183340912', anuncio_id: null, etiqueta: 'pedido', hace: 14 }, [
      ['cliente', 'Hola, ¿me pueden mandar 3 cajitas de rojos con pollo y una de verdes a San Jerónimo? 🙏', 0],
    ]);
    const cRoberto = C({ canal: 'facebook', contacto: 'Roberto Salinas', sugerida: 'Va Roberto, el sábado a las 11 para 60 queda bien. Les propongo el paquete Fiesta en $[__] por persona. Cuando tengan la terraza me pasas la dirección y te aparto la fecha 🤘', anuncio_id: null, etiqueta: 'evento', hace: 60 * 5,
      extraccion: { tipo: 'Reunión', fecha: fExa, hora: '11:00', personas: 60, direccion: 'Terraza en San Pedro (por confirmar)', paquete: 'Fiesta', sucursal: 'Tec', notas: 'Reunión de exalumnos del Tec, generación 2006. Lugar por confirmar.' } }, [
      ['cliente', 'Qué tal, estoy organizando la reunión de exalumnos de mi generación del Tec. Seríamos unos 60.', 2],
      ['javi', 'Qué buen plan Roberto 🤘 ¿Ya tienen fecha y lugar?', 40],
      ['cliente', `Sería el sábado ${new Date(fExa + 'T12:00:00').getDate()} como a las 11. El lugar todavía lo estamos viendo, probablemente una terraza en San Pedro.`, 0],
    ]);
    const cAna = C({ canal: 'whatsapp', contacto: 'Ana Lucía Cantú', sugerida: 'Recibido Ana Lucía ✅ Tu fecha ya está apartada. Unos días antes te escribo para confirmar el horario de llegada y el montaje. ¡Felicidades otra vez! 💍', telefono: '8112098854', anuncio_id: 'ad-bodas', etiqueta: 'evento', hace: 60 * 50, leida: true }, [
      ['cliente', 'Hola! Me pasaron su contacto, quiero chilaquiles para mi boda 💍', 20],
      ['javi', '¡Felicidades Ana Lucía! 🎉 ¿Cuándo es y cuántos invitados?', 30],
      ['cliente', '250 invitados, en Hacienda San Miguel en Allende', 60],
      ['javi', 'Va, te quedaría el paquete Fiesta: estación de chilaquiles con las 3 salsas y barra de toppings. Para apartar la fecha es el anticipo por transferencia, te paso los datos 👇', 120],
      ['cliente', 'Listo, ya te mandé el comprobante del anticipo ✅', 0],
    ]);
    const cLalo = C({ canal: 'instagram', contacto: '@lalo.mtz', sugerida: 'Qué onda Lalo! Gracias por la buena vibra 🙌 Mándanos tu nombre y tu número y te contacta el encargado de la sucursal más cercana.', anuncio_id: null, etiqueta: 'otro', hace: 95 }, [
      ['cliente', 'qué onda, ¿están contratando chilaqueros? me late mucho chambear con ustedes', 0],
    ]);
    const cFest = C({ canal: 'instagram', contacto: '@machacafest', anuncio_id: null, etiqueta: 'otro', hace: 60 * 9, leida: true }, [
      ['cliente', 'Hola Chilabike! Somos del equipo del festival, nos gustaría platicar otra colaboración para el sorteo de la próxima edición 🔥', 30],
      ['javi', '¡Claro! Nos fue increíble la vez pasada. ¿Les marco mañana?', 0],
    ]);
    const cPaty = C({ canal: 'whatsapp', contacto: 'Paty Leal', sugerida: 'Hola Paty! Sí llegamos a Mitras, estamos en Celaya 3133, frente a Medicina 😉 Te enviamos de [__] a [__]. ¿Qué se te antoja?', telefono: '8126601173', anuncio_id: null, etiqueta: 'pedido', hace: 33 }, [
      ['cliente', '¿Tienen servicio a domicilio en Mitras? ¿Hasta qué hora? Somos de la Facultad de Medicina 🙃', 0],
    ]);

    // ---------- eventos ----------
    const E = (o) => { const e = { id: id('evt'), org_id: ORG, estado: 'solicitud', anticipo: 0, monto: null, ...o, creado_en: o.creado_en || hace(60 * 24 * (o.hace_dias || 3)) }; delete e.hace_dias; eventos.push(e); return e; };
    const evCarlos = E({ tipo: 'Desayuno de oficina', fecha: fPosada, hora: '09:00', personas: 120, direccion: 'Oficinas Grupo Industrial Norte, Valle Oriente', paquete: 'Desayuno de oficina', estado: 'cotizado',
      contacto: 'Carlos Medina · Grupo Industrial Norte', telefono: null, sucursal: 'San Pedro', canal: 'Facebook', anuncio_id: 'ad-posadas', conversacion_id: cCarlos.id, monto: 38400, notas: 'Requiere factura. Cotización enviada por correo.', hace_dias: 1 });
    cCarlos.evento_id = evCarlos.id;
    const evAna = E({ tipo: 'Boda o XV', fecha: fBodaAna, hora: '00:30', personas: 250, direccion: 'Hacienda San Miguel, Allende', paquete: 'Fiesta', estado: 'apartado',
      contacto: 'Ana Lucía Cantú', telefono: '8112098854', sucursal: 'San Pedro', canal: 'WhatsApp', anuncio_id: 'ad-bodas', conversacion_id: cAna.id, monto: 72500, anticipo: 21750, notas: 'Anticipo recibido por transferencia.', hace_dias: 2 });
    cAna.evento_id = evAna.id;
    E({ tipo: 'Cumpleaños', fecha: finde(3), hora: '20:00', personas: 35, direccion: 'Col. Contry, Monterrey', paquete: 'Fiesta', estado: 'confirmado', contacto: 'Luis Fernando Ríos', telefono: '8119907321',
      sucursal: 'Centro', canal: 'Instagram', anuncio_id: 'ad-cumple', monto: 9100, anticipo: 9100, notas: 'Pagado completo.', hace_dias: 12 });
    E({ tipo: 'Boda o XV', fecha: finde(10), hora: '01:00', personas: 300, direccion: 'Salón Arboleda, Carretera Nacional', paquete: 'Tornafiesta', estado: 'confirmado', contacto: 'Familia Elizondo', telefono: '8180012765',
      sucursal: 'San Pedro', canal: 'WhatsApp', anuncio_id: 'ad-bodas', monto: 87000, anticipo: 26100, notas: 'XV años de Regina. Llegar 30 min antes para montaje.', hace_dias: 18 });
    E({ tipo: 'Desayuno de oficina', fecha: dia(6), hora: '08:30', personas: 80, direccion: 'Torre Avalanz, San Pedro', paquete: 'Desayuno de oficina', estado: 'apartado', contacto: 'Daniela Soto · Avalanz', telefono: '8112340099',
      sucursal: 'San Pedro de Pinta', canal: 'Facebook', anuncio_id: 'ad-posadas', monto: 25600, anticipo: 7680, notas: 'Desayuno de cierre de trimestre.', hace_dias: 6 });
    E({ tipo: 'Reunión', fecha: finde(17, true), hora: '12:00', personas: 25, direccion: 'Col. Mitras Centro', paquete: 'Fiesta', estado: 'apartado', contacto: 'Jorge Villarreal', telefono: '8127763410',
      sucursal: 'Mitras', canal: 'Página', anuncio_id: 'ad-google', monto: 6500, anticipo: 1950, notas: 'Llegó del formulario de la página (anuncio de Google).', hace_dias: 2 });
    E({ tipo: 'Cumpleaños', fecha: finde(24), hora: '18:00', personas: 50, direccion: 'Jardín de eventos, Cumbres', paquete: 'Fiesta', estado: 'solicitud', contacto: 'Karla Méndez', telefono: '8115582201',
      sucursal: 'Cumbres', canal: 'Página', anuncio_id: 'ad-google', notas: 'Llegó del formulario de la página.', hace_dias: 0.2 });
    E({ tipo: 'Festival', fecha: finde(31), hora: '14:00', personas: 1000, direccion: 'Parque Fundidora', paquete: null, estado: 'cotizado', contacto: 'Producción Futur Festival', telefono: null,
      sucursal: 'Centro', canal: 'Instagram', anuncio_id: null, monto: 120000, notas: 'Stand con 3 estaciones. Revisar permiso del parque.', hace_dias: 4 });
    E({ tipo: 'Desayuno de oficina', fecha: dia(-5), hora: '09:00', personas: 60, direccion: 'Oficinas Cemex, San Pedro', paquete: 'Desayuno de oficina', estado: 'realizado', contacto: 'Mónica Garza', telefono: '8110043321',
      sucursal: 'San Pedro', canal: 'Facebook', anuncio_id: 'ad-posadas', monto: 19200, anticipo: 19200, hace_dias: 20 });
    E({ tipo: 'Cumpleaños', fecha: finde(-10), hora: '19:30', personas: 45, direccion: 'Casa en Lomas del Valle', paquete: 'Fiesta', estado: 'realizado', contacto: 'Andrea Lozano', telefono: '8186671029',
      sucursal: 'San Pedro', canal: 'Instagram', anuncio_id: 'ad-cumple', monto: 11700, anticipo: 11700, hace_dias: 25 });
    E({ tipo: 'Boda o XV', fecha: finde(-3), hora: '01:00', personas: 220, direccion: 'Quinta Real, San Pedro', paquete: 'Tornafiesta', estado: 'realizado', contacto: 'Fernanda y Diego', telefono: '8111094456',
      sucursal: 'San Pedro', canal: 'WhatsApp', anuncio_id: 'ad-bodas', monto: 63800, anticipo: 63800, hace_dias: 30 });
    E({ tipo: 'Cumpleaños', fecha: finde(-17, true), hora: '14:00', personas: 60, direccion: 'Quinta en Santiago', paquete: 'Fiesta', estado: 'realizado', contacto: 'Familia Treviño', telefono: '8183021147',
      sucursal: 'San Pedro', canal: 'WhatsApp', anuncio_id: null, monto: 15600, anticipo: 15600, notas: 'Cliente de siempre (recomendación).', hace_dias: 40 });
    E({ tipo: 'Reunión', fecha: finde(13, true), hora: '13:00', personas: 30, direccion: 'Col. Del Valle', paquete: 'Fiesta', estado: 'cancelado', contacto: 'Iván Cárdenas', telefono: '8126601234',
      sucursal: 'San Pedro', canal: 'WhatsApp', anuncio_id: null, monto: 7800, notas: 'Cambió de fecha, va a volver a escribir.', hace_dias: 9 });

    // Lo que se mandó desde la página de eventos del demo (en este navegador)
    try {
      JSON.parse(localStorage.getItem('chilabike-demo-solicitudes') || '[]').forEach((s) => {
        eventos.push({ id: s.id, org_id: ORG, estado: 'solicitud', anticipo: 0, monto: null, tipo: s.tipo, fecha: s.fecha, hora: s.hora, personas: s.personas, direccion: s.direccion,
          paquete: s.paquete, contacto: s.nombre, telefono: s.telefono, sucursal: null, canal: s.canal || 'Página', utm: s.utm || {},
          anuncio_id: s.canal === 'Google' ? 'ad-google' : null, notas: s.notas, creado_en: s.creado_en, nuevo: true });
      });
    } catch (e) { /* sin almacenamiento: solo los de ejemplo */ }

    const miembros = [
      { org_id: ORG, user_id: 'demo-usuario', nombre: 'Javi', usuario: 'javi', rol: 'dueno', roles: [], empresas: null, activo: true, debe_cambiar_password: false, creado_en: '2026-11-03T12:00:00Z' },
      { org_id: ORG, user_id: 'demo-u1', nombre: 'Jimmy', usuario: 'jimmy', rol: 'administracion', roles: [], empresas: null, activo: true, debe_cambiar_password: false, creado_en: '2026-11-03T12:00:00Z', ultimo_acceso: hace(180) },
    ];
    const E1 = { id: 'emp-chb', org_id: ORG, nombre: 'Chilabike', nombre_corto: 'Chilabike', color: COLOR, activo: true };
    const empresas = [E1, { id: 'emp-cur', org_id: ORG, nombre: 'Curandero', nombre_corto: 'Curandero', color: '#697148', activo: true },
      { id: 'emp-lat', org_id: ORG, nombre: 'Lattico', nombre_corto: 'Lattico', color: '#6B4FA0', activo: true },
      { id: 'emp-cm', org_id: ORG, nombre: 'Casa María', nombre_corto: 'Casa María', color: '#8A6D1F', activo: true }];
    const lv = window.__DEMO_LOYVERSE ? window.__DEMO_LOYVERSE(ORG) : {};
    const centros = window.__MARCA.chilabike.sucursales.map((s, k) => ({ id: 'suc-' + k, org_id: ORG, empresa_id: E1.id, nombre: s, tipo: 'sucursal', activo: true, en_gastos: true }));
    const paquetes = [
      { id: 'paq-1', nombre: 'Desayuno de oficina', precio_persona: null, minimo: null, incluye: 'Cajita de 450 g (verdes, rojos o mixtos) con proteína y bebida, factura' },
      { id: 'paq-2', nombre: 'Fiesta', precio_persona: null, minimo: null, incluye: 'Estación con chilaqueros, las 3 salsas, proteínas y barra de toppings' },
      { id: 'paq-3', nombre: 'Tornafiesta', precio_persona: null, minimo: null, incluye: 'Cajitas a media noche, salsas aparte' },
    ];
    return { organizaciones: [{ id: ORG, nombre: 'Grupo A.M', plan: 'demo' }], miembros, empresas, centros, anuncios, conversaciones, mensajes, eventos, paquetes, ...lv };
  };
})();
