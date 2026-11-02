// Unaria · cliente Arboretum (torre de departamentos en renta). Primer cliente real.
// Por ahora su información vive en la base de Unaria, en su propia cuenta (organización "Arboretum"), separada de la de Unaria:
// cada usuario solo ve los datos de su organización. Si después tiene base propia, solo cambian supabaseUrl y supabaseKey.
// Entra por unaria.mx/arboretum/
window.__CLIENTE = {
  id: 'arboretum',
  nombre: 'Arboretum',
  supabaseUrl: 'https://gimvgsjpeyvdretubrgc.supabase.co',
  supabaseKey: 'sb_publishable_Bs4JM83V0_P3sJ0Ui7i_Pw_IV33gOBm',
  marca: {
    nombre: 'Arboretum',
    marca: ['Arboretum'],
    lema: 'Administración de la torre',
    // Isotipo provisional: un árbol en el color de la marca (cambiar por su logo cuando lo manden)
    isotipo: '<svg viewBox="0 0 120 120"><circle cx="60" cy="46" r="34" fill="var(--primary)"/><circle cx="38" cy="58" r="20" fill="var(--primary)" opacity=".75"/><circle cx="82" cy="58" r="20" fill="var(--primary)" opacity=".75"/><rect x="54" y="66" width="12" height="44" rx="3" fill="currentColor"/></svg>',
    logos: [],
    color: '#2F6B4F', color2: '#24533D', colorSuave: '#E6F0EA',
    modulos: ['inicio', 'residentes', 'rentas', 'servicios', 'lecturas', 'propietarios', 'gastos', 'personal', 'importar', 'usuarios'],
    menu: [
      { id: 'inicio' },
      { id: 'residentes' },
      { id: 'rentas' },
      // El edificio paga un solo recibo de luz, gas y agua; aquí se toma la lectura de cada depto y se le cobra lo suyo
      { titulo: 'Luz, gas y agua', corto: 'Servicios', modulos: ['servicios', 'lecturas'], siempreGrupo: true, icono: 'servicios' },
      { id: 'propietarios' },
      { id: 'gastos' },
      { id: 'personal', corto: 'Equipo' },
    ],
    ajustes: ['usuarios', 'importar'],
    ocultarPestanas: ['rondin'],
    titulos: { personal: 'Equipo de la torre' },
    rentaParcial: true, ocupacion: true,
    reciboEmpresa: 'Arboretum',
    centroPersonal: 'Arboretum',
    dominioUsuarios: '@usuarios.unaria.mx',
  },
};
