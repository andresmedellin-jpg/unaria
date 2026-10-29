// Unaria · el modelo: la instalación propia de Unaria (base de Supabase "unaria", nada de Treme / MEDCO).
// Aquí se construye y se prueba todo lo nuevo antes de llevarlo a cada cliente, y es como queremos venderla.
// Para un cliente: copiar este archivo como clientes/<cliente>.js y cambiar nombre, base, isotipo/logos, color y módulos.
window.__CLIENTE = {
  id: 'unaria',
  nombre: 'Unaria',
  supabaseUrl: 'https://gimvgsjpeyvdretubrgc.supabase.co',
  supabaseKey: 'sb_publishable_Bs4JM83V0_P3sJ0Ui7i_Pw_IV33gOBm',
  marca: {
    nombre: 'Unaria',
    marca: ['unaria'],
    lema: 'Todo encaja.',
    // Isotipo de Unaria: seis piezas en tinta y la pieza que une, en cobre (toma el color de la marca)
    isotipo: '<svg viewBox="0 0 120 120"><g fill="currentColor"><rect x="0" y="0" width="36" height="36" rx="4"/><rect x="0" y="42" width="36" height="36" rx="4"/><rect x="0" y="84" width="36" height="36" rx="4"/><rect x="84" y="0" width="36" height="36" rx="4"/><rect x="84" y="42" width="36" height="36" rx="4"/><rect x="84" y="84" width="36" height="36" rx="4"/></g><rect x="42" y="84" width="36" height="36" rx="4" fill="var(--primary)"/></svg>',
    logos: [],
    color: '#BF4D17', color2: '#9A3D11', colorSuave: '#F6E7DD',
    // Módulos generales (sirven a cualquier giro). El paquete inmobiliario (rentas, ocupación, lecturas, patrimonio) se prende por cliente.
    modulos: ['inicio', 'prospectos', 'cotizaciones', 'inventario', 'obras', 'gastos', 'personal', 'importar', 'usuarios'],
    // Menú corto: lo que va junto se muestra como pestañas; Configuración va abajo, junto al nombre
    menu: [
      { id: 'inicio' },
      { titulo: 'Ventas', modulos: ['prospectos', 'cotizaciones', 'inventario'] },
      { id: 'obras' },
      { id: 'gastos' },
      { id: 'personal', corto: 'RR. HH.' },
    ],
    ajustes: ['usuarios', 'importar'],
    ocultarPestanas: ['rondin'],
    titulos: { obras: 'Proyectos', personal: 'Recursos humanos' }, palabraObra: ['proyecto', 'proyectos'],
    reciboEmpresa: 'Unaria',
    dominioUsuarios: '@usuarios.unaria.mx',
  },
};
