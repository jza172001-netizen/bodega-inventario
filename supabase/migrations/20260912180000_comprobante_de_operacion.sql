-- ============================================================================
-- El comprobante de operación — para que un reintento no mienta
-- ============================================================================
-- EL FALLO
--
-- El asistente manda «Alex: 1 pala» con su `operacionId` y hay una pala. Primera
-- respuesta: «1 registrado». Manda EXACTAMENTE lo mismo otra vez —porque se le
-- perdió la respuesta, porque el bot reintentó, porque el dedo tocó dos veces—.
-- Segunda respuesta: **«0 registrados, 1 sin stock»**.
--
-- No se duplicó nada: la entrega original está en la base y la pala ya salió.
-- Pero la respuesta es falsa, y a un asistente que lee esa respuesta le dice que
-- la entrega NO se hizo. Lo que sigue es un humano despachando dos veces.
--
-- La causa: el endpoint vuelve a planear contra el stock ACTUAL antes de mirar
-- si esa operación ya se había hecho. La pala ya salió, así que el planificador
-- la rechaza por existencias y el reintento nunca llega a la comprobación de
-- identificadores que sí existe.
--
-- Los identificadores deducidos evitan la fila repetida; NO evitan la respuesta
-- equivocada. Son dos problemas distintos y hacía falta cerrar el segundo.
--
-- QUÉ HACE
--
-- Guarda QUÉ contestó cada operación. Un reintento con el mismo identificador y
-- el mismo contenido devuelve la respuesta de la primera vez, aunque hoy no haya
-- existencias. El mismo identificador con OTRO contenido se rechaza: eso no es
-- un reintento, es un error del que llama, y taparlo sería peor.
--
-- La huella es del contenido, no del texto crudo: así «Alex: 1 pala» mandado dos
-- veces como dos entregas distintas NECESITA dos identificadores, que es lo
-- correcto — son dos entregas.
-- ============================================================================

create table if not exists operaciones_endpoint (
    operacion_id text primary key,
    -- sha256 de lo que se pidió. Distinto contenido con el mismo id = error.
    huella text not null,
    -- La respuesta tal cual se dio la primera vez.
    respuesta jsonb not null,
    created_at timestamptz not null default now()
);

create index if not exists operaciones_endpoint_created_idx
    on operaciones_endpoint (created_at desc);

alter table operaciones_endpoint enable row level security;

-- Solo la clave de servicio escribe acá: el navegador no toca esta tabla, y el
-- endpoint corre con la clave de servicio, que se salta las políticas. Sin
-- política para `public`, el comprobante no queda expuesto con la clave pública
-- como sí lo está el resto —que es un problema aparte y más viejo—.
drop policy if exists operaciones_endpoint_sin_acceso_publico on operaciones_endpoint;
