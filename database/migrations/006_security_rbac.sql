-- Fase 9. RBAC granular, estados de seguridad y auditoría append-only.
-- Ejecutar después de 005_whatsapp.sql.
alter type public.user_role add value if not exists 'CAJERO';

begin;

alter table public.profiles
  add column if not exists last_login_at timestamptz,
  add column if not exists must_change_password boolean not null default false;

create table if not exists public.roles (
  code text primary key,
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  code text primary key,
  name text not null,
  module text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_code text not null references public.roles(code) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_code, permission_code)
);

create table if not exists public.user_permission_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  allowed boolean not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_code)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  description text not null,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity, entity_id);

insert into public.roles (code, name, description) values
  ('ADMINISTRADOR', 'Administrador', 'Acceso completo al sistema'),
  ('TECNICO', 'Técnico', 'Operación técnica y órdenes asignadas'),
  ('RECEPCION', 'Recepción', 'Clientes, dispositivos y recepción de órdenes'),
  ('CAJERO', 'Cajero', 'Pagos, saldos y comprobantes')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.permissions (code, name, module, description) values
  ('dashboard.view', 'Ver dashboard', 'dashboard', 'Consultar el panel principal'),
  ('users.view', 'Ver usuarios', 'users', 'Consultar cuentas del personal'),
  ('users.create', 'Crear usuarios', 'users', 'Crear cuentas del personal'),
  ('users.update', 'Editar usuarios', 'users', 'Editar datos del personal'),
  ('users.disable', 'Suspender usuarios', 'users', 'Activar o suspender cuentas'),
  ('roles.view', 'Ver roles', 'roles', 'Consultar roles y permisos'),
  ('roles.update', 'Configurar permisos', 'roles', 'Modificar permisos de roles y usuarios'),
  ('repairs.view', 'Ver reparaciones', 'repairs', 'Consultar órdenes autorizadas'),
  ('repairs.create', 'Crear reparaciones', 'repairs', 'Registrar órdenes'),
  ('repairs.update', 'Editar reparaciones', 'repairs', 'Editar órdenes'),
  ('repairs.delete', 'Eliminar reparaciones', 'repairs', 'Archivar órdenes'),
  ('repairs.assign', 'Asignar reparaciones', 'repairs', 'Asignar técnicos'),
  ('repairs.change_status', 'Cambiar estados', 'repairs', 'Actualizar estados y bitácora'),
  ('clients.view', 'Ver clientes', 'clients', 'Consultar clientes'),
  ('clients.create', 'Crear clientes', 'clients', 'Registrar clientes'),
  ('clients.update', 'Editar clientes', 'clients', 'Editar clientes'),
  ('clients.delete', 'Archivar clientes', 'clients', 'Archivar clientes'),
  ('devices.view', 'Ver dispositivos', 'devices', 'Consultar dispositivos'),
  ('devices.create', 'Crear dispositivos', 'devices', 'Registrar dispositivos'),
  ('devices.update', 'Editar dispositivos', 'devices', 'Editar dispositivos'),
  ('devices.delete', 'Archivar dispositivos', 'devices', 'Archivar dispositivos'),
  ('diagnostics.view', 'Ver diagnósticos', 'diagnostics', 'Consultar diagnósticos'),
  ('diagnostics.create', 'Crear diagnósticos', 'diagnostics', 'Crear diagnósticos'),
  ('diagnostics.ai', 'Usar diagnóstico IA', 'diagnostics', 'Ejecutar diagnóstico IA'),
  ('quotes.view', 'Ver cotizaciones', 'quotes', 'Consultar cotizaciones'),
  ('quotes.create', 'Crear cotizaciones', 'quotes', 'Crear cotizaciones'),
  ('quotes.update', 'Editar cotizaciones', 'quotes', 'Editar cotizaciones'),
  ('quotes.delete', 'Eliminar cotizaciones', 'quotes', 'Archivar cotizaciones'),
  ('inventory.view', 'Ver inventario', 'inventory', 'Consultar inventario'),
  ('inventory.create', 'Crear inventario', 'inventory', 'Crear artículos'),
  ('inventory.update', 'Editar inventario', 'inventory', 'Editar artículos'),
  ('inventory.adjust_stock', 'Ajustar stock', 'inventory', 'Registrar movimientos'),
  ('inventory.view_cost', 'Ver costos', 'inventory', 'Consultar costos internos'),
  ('payments.view', 'Ver pagos', 'payments', 'Consultar pagos'),
  ('payments.create', 'Registrar pagos', 'payments', 'Registrar pagos'),
  ('payments.update', 'Editar pagos', 'payments', 'Editar pagos'),
  ('payments.delete', 'Eliminar pagos', 'payments', 'Archivar pagos'),
  ('warranties.view', 'Ver garantías', 'warranties', 'Consultar garantías'),
  ('warranties.create', 'Crear garantías', 'warranties', 'Crear garantías'),
  ('warranties.update', 'Editar garantías', 'warranties', 'Editar garantías'),
  ('reports.view', 'Ver reportes', 'reports', 'Consultar reportes'),
  ('reports.financial', 'Ver reportes financieros', 'reports', 'Consultar información financiera'),
  ('whatsapp.view', 'Ver WhatsApp', 'whatsapp', 'Consultar comunicaciones'),
  ('whatsapp.send', 'Enviar WhatsApp', 'whatsapp', 'Enviar mensajes'),
  ('whatsapp.configure', 'Configurar WhatsApp', 'whatsapp', 'Configurar automatizaciones'),
  ('settings.view', 'Ver configuración', 'settings', 'Consultar configuración'),
  ('settings.update', 'Editar configuración', 'settings', 'Editar configuración'),
  ('audit.view', 'Ver auditoría', 'audit', 'Consultar actividad del sistema')
on conflict (code) do update set name = excluded.name, module = excluded.module, description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
select 'ADMINISTRADOR', code from public.permissions
on conflict do nothing;

insert into public.role_permissions (role_code, permission_code) values
  ('TECNICO', 'dashboard.view'), ('TECNICO', 'repairs.view'), ('TECNICO', 'repairs.update'), ('TECNICO', 'repairs.change_status'),
  ('TECNICO', 'clients.view'), ('TECNICO', 'devices.view'), ('TECNICO', 'diagnostics.view'), ('TECNICO', 'diagnostics.create'), ('TECNICO', 'diagnostics.ai'),
  ('TECNICO', 'inventory.view'), ('TECNICO', 'inventory.adjust_stock'), ('TECNICO', 'whatsapp.view'), ('TECNICO', 'whatsapp.send'),
  ('RECEPCION', 'dashboard.view'), ('RECEPCION', 'clients.view'), ('RECEPCION', 'clients.create'), ('RECEPCION', 'clients.update'), ('RECEPCION', 'devices.view'),
  ('RECEPCION', 'devices.create'), ('RECEPCION', 'devices.update'), ('RECEPCION', 'repairs.view'), ('RECEPCION', 'repairs.create'), ('RECEPCION', 'repairs.update'),
  ('RECEPCION', 'repairs.change_status'), ('RECEPCION', 'quotes.view'), ('RECEPCION', 'quotes.create'), ('RECEPCION', 'quotes.update'), ('RECEPCION', 'payments.view'),
  ('RECEPCION', 'payments.create'), ('RECEPCION', 'warranties.view'), ('RECEPCION', 'warranties.create'), ('RECEPCION', 'whatsapp.view'), ('RECEPCION', 'whatsapp.send'),
  ('CAJERO', 'dashboard.view'), ('CAJERO', 'repairs.view'), ('CAJERO', 'quotes.view'), ('CAJERO', 'payments.view'), ('CAJERO', 'payments.create'), ('CAJERO', 'payments.update')
on conflict do nothing;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.audit_logs enable row level security;

revoke insert, update, delete on public.roles, public.permissions, public.role_permissions, public.user_permission_overrides, public.audit_logs from anon, authenticated;
grant select on public.roles, public.permissions, public.role_permissions to authenticated;

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated using (public.current_user_role() is not null);
drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated using (public.current_user_role() is not null);
drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated using (public.current_user_role() is not null);
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.current_user_role() = 'ADMINISTRADOR');

commit;
