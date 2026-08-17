-- Dos huecos estructurales detectados el 2026-08-17:
--
-- 1) El enum user_role no incluía 'visitor', pero el código (UserRole.VISITOR) sí lo usa.
--    Sin este valor, guardar un usuario con rol visitante falla con 22P02. Por eso el
--    usuario "Visitante" quedó almacenado como 'employee', con permisos de empleado.
alter type user_role add value if not exists 'visitor';

-- 2) La tabla behavior_logs no existía: los registros de comportamiento que muestra la
--    vista de Trazabilidad vivían solo en localStorage y se perdían cuando el navegador
--    limpiaba el almacenamiento (misma causa raíz que la pérdida del kardex).
create table if not exists behavior_logs (
    id          text primary key,
    timestamp   timestamptz not null default now(),
    actor       text not null default '',
    action      text not null default '',
    detail      text not null default '',
    created_at  timestamptz not null default now()
);

create index if not exists behavior_logs_timestamp_idx on behavior_logs (timestamp desc);

alter table behavior_logs enable row level security;

drop policy if exists service_access on behavior_logs;
create policy service_access on behavior_logs for all using (true) with check (true);
