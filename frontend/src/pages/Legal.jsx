import { Link } from 'react-router-dom'
import BrandLogo from '../components/branding/BrandLogo.jsx'
import LegalLinks from '../components/legal/LegalLinks.jsx'
import { SUPPORT_EMAIL, supportMailto } from '../utils/constants.js'

const UPDATED = '28 de octubre de 2026'

function LegalPage({ title, children }) {
  return (
    <main className="min-h-screen bg-[var(--tf-bg)] px-4 py-8 text-[var(--tf-text)] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between"><Link to="/" aria-label="Ir al inicio"><BrandLogo /></Link><Link to="/precios" className="ct-btn ct-btn-secondary">Ver planes</Link></header>
        <article className="tf-legal mt-12">
          <h1>{title}</h1>
          <p className="text-sm text-[var(--tf-text-subtle)]">Última actualización: {UPDATED}</p>
          {children}
        </article>
        <footer className="mt-12 border-t border-[var(--tf-border)] pt-6"><LegalLinks /></footer>
      </div>
    </main>
  )
}

const Email = () => <a href={supportMailto('Datos personales TallerFlow')}>{SUPPORT_EMAIL}</a>

export function PrivacyNotice() {
  return (
    <LegalPage title="Aviso de privacidad">
      <p>TallerFlow (en adelante, “TallerFlow”), con operación en México y contacto en <Email />, es responsable del tratamiento de los datos personales de las personas que crean una cuenta en la plataforma, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>

      <h2>Datos que recabamos</h2>
      <ul>
        <li><strong>De quien usa la plataforma:</strong> nombre, correo electrónico, contraseña (guardada cifrada), nombre y datos de contacto del taller, y el rol de cada persona del equipo.</li>
        <li><strong>De los clientes del taller:</strong> nombre, teléfono, correo y los datos de sus equipos y reparaciones que el taller registra.</li>
        <li><strong>De uso:</strong> registros técnicos como fecha de acceso, dirección IP y acciones realizadas, para seguridad y auditoría.</li>
      </ul>
      <p>No recabamos datos personales sensibles. Los pagos se procesan en Mercado Pago: TallerFlow no recibe ni guarda los números de tarjeta.</p>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Dar el servicio: crear la cuenta, operar el taller en la plataforma y mostrar el seguimiento de reparaciones a sus clientes.</li>
        <li>Cobrar la suscripción y avisar de pagos, vencimientos y cambios del servicio.</li>
        <li>Dar soporte y mantener la seguridad de la plataforma.</li>
      </ul>
      <p>No vendemos datos personales ni los usamos para publicidad de terceros.</p>

      <h2>Datos de los clientes del taller</h2>
      <p>Cada taller decide qué datos de sus clientes registra y es responsable de ellos frente a sus clientes; TallerFlow solo los trata por cuenta del taller para dar el servicio. Cada taller ve únicamente su propia información.</p>

      <h2>Con quién se comparten</h2>
      <p>Solo con los proveedores necesarios para operar el servicio, que los tratan por nuestra cuenta: alojamiento y base de datos (Railway y Supabase) y cobro de suscripciones (Mercado Pago). También cuando lo exija una autoridad competente.</p>

      <h2>Tus derechos (ARCO)</h2>
      <p>Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos, o revocar tu consentimiento, escribiendo a <Email /> desde el correo de tu cuenta. Indica tu nombre, lo que pides y, si aplica, el dato a corregir. Respondemos en un máximo de 20 días hábiles. Si eres cliente de un taller, dirige tu solicitud primero a ese taller.</p>

      <h2>Conservación</h2>
      <p>Conservamos los datos mientras la cuenta esté activa y el tiempo que exijan las obligaciones fiscales y legales aplicables. Después se eliminan o se anonimizan.</p>

      <h2>Cookies y almacenamiento local</h2>
      <p>Usamos almacenamiento del navegador para mantener tu sesión y tus preferencias (como el tema y recordar tu correo). No usamos cookies de publicidad.</p>

      <h2>Cambios a este aviso</h2>
      <p>Publicaremos cualquier cambio en esta página con su fecha de actualización.</p>
    </LegalPage>
  )
}

export function Terms() {
  return (
    <LegalPage title="Términos y condiciones">
      <p>Estos términos regulan el uso de TallerFlow, una plataforma en línea para administrar talleres de reparación. Al crear una cuenta o contratar un plan aceptas estos términos y el <Link to="/privacidad">aviso de privacidad</Link>.</p>

      <h2>La cuenta</h2>
      <ul>
        <li>Quien registra el taller es su dueño en la plataforma y responde por las personas que invita a su equipo.</li>
        <li>Debes dar datos verdaderos y cuidar tu contraseña. Avísanos de inmediato si crees que alguien entró a tu cuenta.</li>
      </ul>

      <h2>Prueba gratuita, planes y pagos</h2>
      <ul>
        <li>Los talleres nuevos pueden tener un periodo de prueba gratuito; al terminar, se necesita un plan de pago para seguir usando la plataforma.</li>
        <li>Los planes se cobran por adelantado, cada mes o cada año, en pesos mexicanos, mediante Mercado Pago, y se renuevan solos hasta que los canceles.</li>
        <li>Puedes cancelar cuando quieras desde “Mi plan”: conservas el acceso hasta el final del periodo pagado y no se hacen más cobros. No hay reembolsos por periodos ya iniciados, salvo lo que establezca la ley.</li>
        <li>Si un cobro falla, Mercado Pago lo reintenta; si no se logra en el plazo de gracia, el acceso se pausa hasta regularizar el pago. Tu información se conserva.</li>
        <li>Las funciones marcadas como “Próximamente” todavía no están disponibles y no forman parte de lo que se cobra hasta que se activen.</li>
        <li>Podemos cambiar los precios avisando con al menos 30 días de anticipación; el cambio aplica desde la siguiente renovación.</li>
      </ul>

      <h2>Uso permitido</h2>
      <p>No puedes usar TallerFlow para actividades ilegales, para enviar mensajes no solicitados, para intentar acceder a información de otros talleres ni para afectar el funcionamiento del servicio. Podemos suspender una cuenta que incumpla estos términos.</p>

      <h2>Tu información</h2>
      <p>La información que registras es tuya. Tú respondes por tener permiso de tus clientes para registrar y usar sus datos, incluido enviarles avisos. Si cancelas, puedes pedirnos una copia de tu información escribiendo a soporte.</p>

      <h2>Disponibilidad y responsabilidad</h2>
      <p>Trabajamos para que el servicio esté disponible y seguro, pero puede haber interrupciones por mantenimiento o fallas de terceros. Los resultados de herramientas de apoyo (como sugerencias de diagnóstico) son orientativos: la decisión final es del técnico. En la medida que permita la ley, nuestra responsabilidad se limita al monto pagado por el servicio en los últimos 3 meses.</p>

      <h2>Cambios y contacto</h2>
      <p>Podemos actualizar estos términos; publicaremos la nueva versión en esta página. Para cualquier duda escribe a <a href={supportMailto()}>{SUPPORT_EMAIL}</a>. Estos términos se rigen por las leyes de México.</p>
    </LegalPage>
  )
}
