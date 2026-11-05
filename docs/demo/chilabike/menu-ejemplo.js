// Menú de ejemplo de Chilabike (el real se captura en el portal: Chilabike → Menú). Lo usan el menú interactivo
// (arma/), el demo del portal y, en producción, es la forma del documento que guarda la tabla app.menus.
// Cada paso es una pregunta del menú: "una" = se escoge una opción; "varias" = las que quiera.
// estilo: "salsa" (tarjetas grandes con color) · "tarjeta" (con ícono y precio) · "chips" (botones chicos).
window.MENU_CHILABIKE = {
  negocio: 'Chilabike',
  producto: { nombre: 'Cajita de chilaquiles', detalle: '450 g', precio: 150, incluye: 'frijoles, queso fresco, crema, cebolla morada y cilantro' },
  pasos: [
    { id: 'salsa', titulo: '¿Qué salsa?', ayuda: 'Tu cajita ya trae frijoles, queso fresco, crema, cebolla morada y cilantro.', tipo: 'una', obligatorio: true, estilo: 'salsa', opciones: [
      { id: 'verde', nombre: 'Verdes', desc: 'Los de siempre', precio: 0, color: 'linear-gradient(160deg,#6E9F3B,#3F6B1F)', disponible: true },
      { id: 'roja', nombre: 'Rojos', desc: 'Para los que sí aguantan', precio: 0, color: 'linear-gradient(160deg,#D9452B,#8F1F12)', disponible: true },
      { id: 'mixta', nombre: 'Mixtos', desc: 'Mitad y mitad', precio: 0, color: 'linear-gradient(110deg,#4F8A2B 0 50%,#B8321D 50% 100%)', disponible: true }] },
    { id: 'picor', titulo: '¿Qué tanto pica?', ayuda: '', tipo: 'una', obligatorio: false, estilo: 'chips', junto: true, predeterminado: 'normal', opciones: [
      { id: 'sin', nombre: 'Sin picante', precio: 0, disponible: true }, { id: 'normal', nombre: 'Normal', precio: 0, disponible: true }, { id: 'pique', nombre: 'Que pique 🔥', precio: 0, disponible: true }] },
    { id: 'proteina', titulo: '¿Con qué la quieres?', ayuda: 'Escoge una proteína.', tipo: 'una', obligatorio: true, estilo: 'tarjeta', opciones: [
      { id: 'pollo', nombre: 'Pollo', emoji: '🍗', precio: 0, disponible: true }, { id: 'huevo', nombre: 'Huevo estrellado', emoji: '🍳', precio: 0, disponible: true },
      { id: 'arrachera', nombre: 'Arrachera', emoji: '🥩', precio: 35, disponible: true }, { id: 'chorizo', nombre: 'Chorizo', emoji: '🌭', precio: 20, disponible: true },
      { id: 'nada', nombre: 'Sin proteína', emoji: '🌱', precio: 0, disponible: true }] },
    { id: 'toppings', titulo: 'Ponle lo que quieras', ayuda: 'Toca todos los que se te antojen.', tipo: 'varias', obligatorio: false, estilo: 'chips', opciones: [
      { id: 'aguacate', nombre: 'Aguacate', precio: 25, disponible: true }, { id: 'queso', nombre: 'Queso extra', precio: 15, disponible: true },
      { id: 'chiltepin', nombre: 'Chiltepín', precio: 20, disponible: true }, { id: 'crema', nombre: 'Doble crema', precio: 10, disponible: true },
      { id: 'frijoles', nombre: 'Frijoles extra', precio: 10, disponible: true }, { id: 'totopos', nombre: 'Totopos extra', precio: 15, disponible: true },
      { id: 'aparte', nombre: 'Salsa aparte', precio: 0, disponible: true }, { id: 'sincebolla', nombre: 'Sin cebolla', precio: 0, disponible: true }] },
    { id: 'bebida', titulo: '¿Algo de tomar?', ayuda: 'Para acompañar.', tipo: 'una', obligatorio: true, estilo: 'tarjeta', opciones: [
      { id: 'refresco', nombre: 'Refresco 600 ml', emoji: '🥤', precio: 39, disponible: true }, { id: 'agua', nombre: 'Agua', emoji: '💧', precio: 25, disponible: true },
      { id: 'cafe', nombre: 'Café de olla', emoji: '☕', precio: 35, disponible: true }, { id: 'nada', nombre: 'Nada', emoji: '—', precio: 0, disponible: true }] },
  ],
  envio: 35,
  pagos: ['Efectivo', 'Transferencia'],
  sucursales: ['San Pedro', 'San Jerónimo', 'Mitras', 'San Pedro de Pinta', 'Cumbres', 'Centro', 'Venustiano Carranza', 'Tec'],
  // Eventos: así cotiza Javier (precio por persona, mínimo de órdenes según el horario, lo que incluye y el anticipo).
  eventos: {
    tipos: ['Cumpleaños', 'Boda o XV', 'Desayuno de oficina', 'Reunión', 'Tornafiesta', 'Otro'],
    precioPersona: 110,
    condiciones: 'Precio válido en el área metropolitana de Monterrey y a pronto pago.',
    horarios: [
      { id: 'manana', nombre: 'En la mañana', desde: '06:00', hora: '10:00', minimo: 35 },
      { id: 'tarde', nombre: 'Después de las 2:00 pm', desde: '14:00', hora: '15:00', minimo: 45 },
      { id: 'noche', nombre: 'Después de las 8:00 pm', desde: '20:00', hora: '21:00', minimo: 65 },
      { id: 'madrugada', nombre: 'Madrugada', desde: '00:00', hora: '01:00', minimo: 100 }],
    incluye: [
      { emoji: '🌶️', t: 'Salsas', d: 'Roja y verde' },
      { emoji: '🍗', t: 'Proteínas', d: 'Pollo y chicharrón guisado' },
      { emoji: '🧀', t: 'Toppings', d: 'Crema, cebolla, cilantro, queso y frijoles' },
      { emoji: '🍽️', t: 'Desechables', d: 'Platos, cubiertos y servilletas' },
      { emoji: '🛒', t: 'Montaje', d: 'Carrito o montaje tipo buffet' },
      { emoji: '🧑‍🍳', t: 'Personal', d: 'Personal para el servicio' }],
    traslado: 'El traslado y montaje se cotiza según la ubicación.',
    anticipo: 50,
    pideFactura: true,
  },
  ejemplo: true,
};
