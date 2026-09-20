-- ═══════════════════════════════════════════════════════════════════════
--  CARLOSTECH AI — Datos de demostración (OPCIONAL)
--  Ejecutar DESPUÉS de schema.sql si quieres datos de prueba.
--  No son valores permanentes: se remplazan por datos reales en Fase 3.
-- ═══════════════════════════════════════════════════════════════════════

-- Clientes demo (sólo si la tabla está vacía)
insert into customers (first_name, last_name, phone, whatsapp, email, notes)
select 'Juan', 'Pérez', '+52 555 246 8101', '+52 555 246 8101', 'juan.perez@example.com', 'Cliente frecuente'
where not exists (select 1 from customers);

insert into customers (first_name, last_name, phone, whatsapp, email, notes)
select 'María', 'López', '+52 555 369 2580', '+52 555 369 2580', null, null
where not exists (select 1 from customers where phone = '+52 555 369 2580');

-- Dispositivos demo vinculados a los clientes demo
insert into devices (customer_id, brand, model, color, imei, os, physical_condition, notes)
select c.id, 'Apple', 'iPhone 13', 'Medio noche', '356938035640001', 'iOS 18', 'Buen estado general', 'No carga al conectar cable'
from customers c
where c.email = 'juan.perez@example.com'
  and not exists (select 1 from devices where imei = '356938035640001');

insert into devices (customer_id, brand, model, color, imei, os, physical_condition, notes)
select c.id, 'Samsung', 'Galaxy A15', 'Negro', null, 'Android 14', 'Pantalla rota', 'Golpe en marco superior'
from customers c
where c.phone = '+52 555 369 2580'
  and not exists (select 1 from devices where brand = 'Samsung' and model = 'Galaxy A15');