// Ayuda en lenguaje del taller: qué hace cada opción del menú, cuándo usarla y
// qué se puede hacer ahí. La leen el menú lateral (globo al pasar el mouse), el
// bloque "Cómo funciona" de cada página y la Guía del sistema (/guia).

export const SECTION_INFO = {
  Taller: 'El trabajo diario: los equipos que entran, sus dueños y cómo avanzan.',
  Herramientas: 'Apoyo para encontrar la falla de un equipo.',
  Negocio: 'El dinero y los materiales: cotizar, cobrar, refacciones y garantías.',
  'Administración': 'Tu equipo de trabajo, la seguridad y la cuenta del taller.',
}

export const MODULE_HELP = {
  '/': {
    description: 'Resumen del día: cuántos equipos hay en cada etapa y qué entregas van atrasadas.',
    when: 'Al abrir y al cerrar el taller, para ver qué urge.',
    tasks: ['Toca una etapa del flujo para ver solo esas órdenes.', 'Revisa las entregas atrasadas y avisa a esos clientes.', 'Usa Actualizar si alguien acaba de registrar cambios.'],
  },
  '/reparaciones': {
    description: 'Cada equipo que recibes, con su orden, técnico asignado y estado hasta que se entrega.',
    when: 'Siempre que entra, avanza o sale un equipo del taller.',
    tasks: ['Registra el equipo con la falla que reporta el cliente.', 'Cambia el estado conforme avanza; el cliente lo ve en su enlace de seguimiento.', 'Abre una orden para ver su bitácora, el cobro y los mensajes enviados.'],
  },
  '/clientes': {
    description: 'Los datos de contacto de cada cliente, sus equipos y todo lo que le has reparado.',
    when: 'Cuando necesitas contactar a un cliente o revisar qué le has hecho antes.',
    tasks: ['Busca por nombre, teléfono o correo.', 'Abre un cliente para ver sus equipos, órdenes y mensajes.', 'Mantén su teléfono al día para que le lleguen los avisos por WhatsApp.'],
  },
  '/dispositivos': {
    description: 'Los teléfonos y tabletas de tus clientes, con modelo, IMEI e historial de reparaciones.',
    when: 'Cuando un equipo regresa y quieres saber qué se le hizo antes.',
    tasks: ['Busca un equipo por modelo, cliente o IMEI.', 'Revisa cada reparación que ha tenido ese equipo.', 'Inicia una reparación nueva desde la ficha del equipo.'],
  },
  '/diagnostico-ia': {
    description: 'Describe la falla y la IA te sugiere causas probables y pruebas. Un técnico siempre confirma el resultado.',
    when: 'Cuando la falla no es obvia y quieres un punto de partida.',
    tasks: ['Escribe la marca, el modelo y los síntomas del equipo.', 'Revisa las causas probables y las pruebas sugeridas.', 'Haz las pruebas en el equipo antes de cotizar.'],
  },
  '/herramientas-dispositivo': {
    description: 'Lee la información técnica de un teléfono Android conectado por USB y ejecuta comandos ADB y Fastboot.',
    when: 'Cuando necesitas datos reales del equipo o reiniciarlo en un modo especial.',
    tasks: ['Instala y vincula el agente de TallerFlow en la computadora del técnico.', 'Conecta el teléfono por USB y acepta la autorización en su pantalla.', 'Ejecuta la acción; las delicadas piden confirmación antes de correr.'],
  },
  '/cotizaciones': {
    description: 'Presupuestos con el costo de la reparación para que el cliente lo apruebe antes de empezar.',
    when: 'Después del diagnóstico y antes de reparar.',
    tasks: ['Captura el costo del servicio, el descuento y el impuesto.', 'Marca si el cliente la aceptó o la rechazó.', 'Ponle fecha de vigencia para que el precio no quede abierto.'],
  },
  '/pagos': {
    description: 'Anticipos, pagos parciales y liquidaciones, para saber cuánto has cobrado y cuánto falta.',
    when: 'Cada vez que un cliente te entrega dinero.',
    tasks: ['Registra el anticipo al recibir el equipo.', 'Agrega pagos parciales si el cliente paga en partes.', 'Liquida el saldo al entregar: efectivo, tarjeta o transferencia.'],
  },
  '/inventario': {
    description: 'Las refacciones que tienes, su precio y cuántas quedan. Te avisa cuando algo está por agotarse.',
    when: 'Cuando llega mercancía, usas una pieza o haces conteo físico.',
    tasks: ['Agrega cada refacción con su stock mínimo.', 'Registra entradas, salidas y ajustes; cada movimiento queda guardado.', 'Revisa el stock bajo antes de hacer tu pedido al proveedor.'],
  },
  '/garantias': {
    description: 'La cobertura de cada servicio entregado y cuántos días le quedan.',
    when: 'Al entregar un equipo y cuando un cliente regresa con un reclamo.',
    tasks: ['Registra la garantía al entregar el equipo.', 'Consulta si un reclamo sigue dentro de la cobertura.', 'Invalida la garantía si el equipo regresa golpeado o abierto por alguien más.'],
  },
  '/comunicaciones': {
    description: 'Los avisos que el taller envía por WhatsApp y si cada mensaje llegó a su destino.',
    when: 'Para confirmar que el cliente recibió el aviso de su equipo.',
    tasks: ['Activa los avisos automáticos para cada cambio de estado.', 'Revisa si cada mensaje se envió o tuvo un error.', 'Envía mensajes manuales desde la ficha de una reparación.'],
  },
  '/reportes': {
    description: 'Totales históricos del taller: reparaciones por estado, marcas que más atiendes y refacciones bajo mínimo.',
    when: 'Al cerrar la semana o el mes, para ver cómo va el negocio.',
    tasks: ['Compara cuántas órdenes hay en cada estado.', 'Detecta las marcas que más te llegan para surtir sus piezas.', 'Revisa qué refacciones están por debajo de su mínimo.'],
  },
  '/personal': {
    description: 'Las cuentas de tu equipo de trabajo: quién puede entrar al sistema y con qué rol.',
    when: 'Cuando alguien empieza o deja de trabajar en el taller.',
    tasks: ['Crea una cuenta para cada persona; no compartan usuario.', 'Asigna el rol según su trabajo: recepción, técnico, cajero o administrador.', 'Quita el acceso a quien ya no trabaja contigo.'],
  },
  '/roles': {
    description: 'Qué puede ver y hacer cada rol. El servidor revisa estos permisos en cada acción.',
    when: 'Cuando un rol necesita más o menos acceso en todos los talleres.',
    tasks: ['Elige un rol para ver sus permisos.', 'Marca o desmarca permisos y guarda los cambios.', 'Da a cada rol solo lo que necesita para su trabajo.'],
  },
  '/auditoria': {
    description: 'El registro de acciones sensibles: inicios de sesión, cambios de rol y de estado. Nadie puede editarlo.',
    when: 'Cuando necesitas saber quién hizo un cambio y cuándo.',
    tasks: ['Filtra por tipo de acción o busca por texto.', 'Revisa quién hizo cada cambio y a qué hora.', 'Usa el registro para aclarar dudas con tu equipo.'],
  },
  '/facturacion': {
    description: 'Tu licencia de TallerFlow: plan contratado (Plus, Pro o Max), próximo cobro y pagos con Mercado Pago.',
    when: 'Para contratar, cambiar o cancelar tu plan.',
    tasks: ['Revisa si tu licencia está activa, hasta cuándo y cuántos usuarios usas.', 'Contrata o cambia de plan; pagas con tarjeta en Mercado Pago.', 'Cancela cuando quieras: conservas el acceso hasta el último día pagado.'],
  },
  '/configuracion': {
    description: 'Los ajustes del taller: conexión con WhatsApp, licencia y accesos.',
    when: 'Al empezar a usar TallerFlow o cuando cambia algo del taller.',
    tasks: ['Revisa si WhatsApp Business está conectado.', 'Entra a licencia, personal y agente de dispositivos desde el índice de esta página.', 'Configura qué avisos automáticos reciben tus clientes.'],
  },
}

// El recorrido de un equipo por el taller y la opción del menú que atiende cada paso.
// Los tonos son los mismos del flujo del panel de control.
export const JOURNEY = [
  { title: 'Recibir', text: 'Registra al cliente, su equipo y la falla que reporta. La orden queda lista para darle seguimiento.', paths: ['/reparaciones', '/clientes', '/dispositivos'], tone: 'received' },
  { title: 'Diagnosticar', text: 'Revisa el equipo para encontrar la falla. La IA y las herramientas ADB ayudan en los casos difíciles.', paths: ['/diagnostico-ia', '/herramientas-dispositivo'], tone: 'diagnosis' },
  { title: 'Cotizar', text: 'Comparte el costo con el cliente y espera su autorización antes de reparar.', paths: ['/cotizaciones'], tone: 'parts' },
  { title: 'Reparar', text: 'Avanza el estado de la orden y registra las refacciones que uses. El cliente recibe avisos por WhatsApp.', paths: ['/reparaciones', '/inventario', '/comunicaciones'], tone: 'repair' },
  { title: 'Cobrar y entregar', text: 'Registra el anticipo y la liquidación, y marca la orden como entregada.', paths: ['/pagos', '/reparaciones'], tone: 'ready' },
  { title: 'Dar garantía', text: 'Deja registrada la cobertura para atender cualquier reclamo con fechas claras.', paths: ['/garantias'], tone: 'delivered' },
]
