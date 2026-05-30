import React, { useState } from 'react';

const Section: React.FC<{ icon: string; title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ icon, title, children, defaultOpen = false }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-xl">{icon}</span>
                    <h2 className="text-sm font-black text-gray-800 uppercase tracking-tight">{title}</h2>
                </div>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
            </button>
            {open && <div className="px-5 pb-5 space-y-3 text-sm text-gray-600 leading-relaxed border-t border-gray-50">{children}</div>}
        </div>
    );
};

const Row: React.FC<{ icon: string; label: string; desc: string }> = ({ icon, label, desc }) => (
    <div className="flex gap-3 pt-3">
        <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
        <div>
            <span className="font-bold text-gray-800">{label} — </span>
            <span>{desc}</span>
        </div>
    </div>
);

const Tip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs font-semibold text-blue-700 mt-2">{children}</p>
);

export const HelpView: React.FC = () => (
    <div className="space-y-4 max-w-2xl mx-auto">
        <div className="text-center py-4">
            <p className="text-2xl font-black text-gray-900 uppercase tracking-tight">Centro de ayuda</p>
            <p className="text-sm text-gray-400 mt-1">Guía rápida de uso — Bodega Grupo Montecielo</p>
        </div>

        {/* CHATBOT — sección principal */}
        <Section icon="🤖" title="Asistente de Bodega (chatbot)" defaultOpen={true}>
            <p className="pt-3">
                El botón azul flotante <strong>💬</strong> en la esquina inferior derecha abre el Asistente.
                Tiene <strong>tres botones</strong> en la parte de arriba — cada uno para una tarea distinta:
            </p>

            <div className="mt-3 space-y-4">
                {/* Despacho */}
                <div className="bg-gray-900 rounded-xl p-3 text-white">
                    <p className="font-black text-sm">🚀 Despacho — salidas grandes</p>
                    <p className="text-xs text-gray-300 mt-1">Para cuando vas a sacar varios ítems de distintos tipos a la vez. Sigue 4 pasos guiados:</p>
                    <div className="mt-2 space-y-1 text-xs text-gray-300">
                        <p><strong className="text-white">Paso 1:</strong> Elige el o los tipos de ítem (manual, eléctrica, EPP, consumible — puedes marcar varios).</p>
                        <p><strong className="text-white">Paso 2:</strong> Elige el trabajador. Si es un <em>oficial</em>, aparece otro paso para elegir cuál de sus trabajadores se lleva la herramienta. Puedes crear un trabajador nuevo directamente desde aquí.</p>
                        <p><strong className="text-white">Paso 3:</strong> Asigna un proyecto (opcional). Si no existe, créalo en el momento.</p>
                        <p><strong className="text-white">Paso 4:</strong> Selecciona los ítems y cantidades. Si un ítem no existe, toca <em>"+ Crear nuevo"</em> para agregarlo al inventario y al despacho en el mismo paso.</p>
                        <p><strong className="text-white">Confirmar:</strong> Revisa el resumen, ajusta la fecha si es retroactiva, y confirma. Se registra todo de un golpe.</p>
                    </div>
                    <Tip>💡 Las herramientas (manual y eléctrica) quedan como préstamo — aparecen en Préstamos para devolver. Los consumibles y EPP son salidas definitivas.</Tip>
                </div>

                {/* Rápido */}
                <div className="bg-blue-600 rounded-xl p-3 text-white">
                    <p className="font-black text-sm">⚡ Rápido — un ítem al instante</p>
                    <p className="text-xs text-blue-100 mt-1">Para cuando solo necesitas asignar un ítem rápidamente, sin wizard. Todo en una sola pantalla:</p>
                    <div className="mt-2 space-y-1 text-xs text-blue-100">
                        <p>• Elige trabajador (si es oficial, aparece selector de sub-trabajador).</p>
                        <p>• Elige el tipo de ítem (los 4 tipos disponibles).</p>
                        <p>• Selecciona el ítem de la lista. Si no hay stock, toca <em>"+ Crear nuevo"</em> para crearlo y asignarlo.</p>
                        <p>• Asigna proyecto (opcional) o crea uno nuevo en el momento.</p>
                        <p>• Confirma — se registra solo ese ítem.</p>
                    </div>
                </div>

                {/* Agregar */}
                <div className="bg-green-600 rounded-xl p-3 text-white">
                    <p className="font-black text-sm">➕ Agregar — añadir al inventario</p>
                    <p className="text-xs text-green-100 mt-1">Para cuando llega mercancía o necesitas registrar ítems nuevos. No registra salidas — solo crea stock.</p>
                    <div className="mt-2 space-y-1 text-xs text-green-100">
                        <p><strong className="text-white">Paso 1:</strong> Elige el o los tipos de ítem a agregar.</p>
                        <p><strong className="text-white">Paso 2:</strong> Para cada tipo, usa <em>"+ Crear nuevo"</em> para agregar un género. Para herramientas, agrega las especies (color + marca). El formulario queda abierto para que puedas crear el siguiente género sin volver atrás.</p>
                        <p>Al confirmar, todos los ítems del carrito se crean en el inventario de una sola vez.</p>
                    </div>
                </div>
            </div>
        </Section>

        {/* Genus y especies */}
        <Section icon="🔨" title="Herramientas: género y especies">
            <p className="pt-3">Las herramientas manuales y eléctricas usan un sistema de <strong>género + especies</strong> para diferenciar variantes del mismo ítem:</p>
            <Row icon="📌" label="Género" desc='El nombre base del ítem. Ej: "Pulidora", "Taladro", "Martillo".' />
            <Row icon="🎨" label="Especie" desc='Una variante específica definida por color y marca. Ej: Roja · Bosch, Azul · Makita. Cada especie se crea como un ítem independiente en el inventario.' />
            <p className="mt-2">Si tienes 3 pulidoras de distintas marcas, creas el género "Pulidora" y agregas 3 especies. Resultado: 3 ítems separados que puedes prestar de forma independiente.</p>
            <Tip>💡 Los consumibles y EPP no usan especies — solo nombre y cantidad.</Tip>
        </Section>

        {/* Personal y oficiales */}
        <Section icon="👷" title="Personal: oficiales y cuadrillas">
            <p className="pt-3">El personal tiene dos niveles:</p>
            <Row icon="👷" label="Oficial (jefe de cuadrilla)" desc='Trabajador marcado como oficial. Al asignarle una herramienta en el chatbot, aparece un paso extra para elegir cuál de sus trabajadores se la lleva.' />
            <Row icon="👤" label="Trabajador de cuadrilla" desc="Está vinculado a un oficial. Aparece listado dentro de la tarjeta del oficial en la vista de Personal." />
            <p className="mt-2">Para marcar a alguien como oficial: edita el trabajador (botón ✏️ en su tarjeta) y activa la opción <em>"Es jefe de cuadrilla"</em>.</p>
            <Tip>💡 Al crear un nuevo trabajador desde el chatbot, si existe un solo oficial en la empresa, se le asigna automáticamente a esa cuadrilla.</Tip>
        </Section>

        {/* Kardex */}
        <Section icon="📋" title="El Kardex — 4 pestañas">
            <Row icon="📋" label="Historial" desc="Todos los movimientos registrados: compras, entradas, salidas y mermas. Solo el Bodeguero puede eliminar registros." />
            <Row icon="🔑" label="Préstamos" desc="Herramientas actualmente fuera de bodega. Agrupa por urgencia: más de 14 días 🔴, entre 7 y 14 🟡, al día 🟢. Botón 📲 por trabajador para recordar por WhatsApp." />
            <Row icon="📦" label="Inventario" desc="Catálogo completo con filtros por tipo. Toca cualquier ítem para ver su historial y quién lo tiene." />
            <Row icon="🏗" label="Proyectos" desc="Obras activas con personal, herramientas prestadas y materiales consumidos." />
        </Section>

        {/* A Recoger */}
        <Section icon="📍" title="Vista A Recoger">
            <p className="pt-3">
                En la pestaña <strong>Préstamos</strong>, el botón <em>"📍 A Recoger"</em> muestra todos los préstamos que marcaste para ir a buscar.
            </p>
            <Row icon="✓" label="Marcar para recoger" desc='En cualquier préstamo activo, toca el botón "📍 Ir a recoger". Aparece en esta vista.' />
            <Row icon="📲" label="Avisar por WhatsApp" desc="Elige el trabajador que va a ir a recoger desde el selector de arriba. El botón verde genera un mensaje de WhatsApp con la lista completa de ítems a recoger, ya listo para enviar." />
            <Row icon="✓ Recogida" label="Confirmar recogida" desc="Toca el botón verde junto al ítem. Abre el modal de devolución para registrar el estado en que regresó la herramienta." />
            <Tip>💡 Para que el botón de WhatsApp funcione, el trabajador elegido debe tener número de teléfono guardado.</Tip>
        </Section>

        {/* WhatsApp */}
        <Section icon="📲" title="Recordatorios por WhatsApp">
            <p className="pt-3">Hay dos tipos de mensajes de WhatsApp en la app:</p>
            <Row icon="🔔" label="Recordatorio de préstamo" desc="En Préstamos → tarjeta del trabajador → botón 📲. Envía la lista de herramientas que tiene prestadas con los días transcurridos." />
            <Row icon="📍" label="Aviso de recogida" desc="En la vista A Recoger, elige al trabajador que va a recoger y toca Avisar. Envía la lista de ítems a buscar." />
            <Tip>💡 El mensaje se abre en WhatsApp ya escrito — solo debes tocar Enviar.</Tip>
        </Section>

        {/* Roles */}
        <Section icon="👥" title="Roles de usuario">
            <Row icon="🔵" label="Bodeguero (Owner)" desc="Acceso completo: crear, editar y eliminar ítems y trabajadores, registrar movimientos, usar el chatbot, marcar devoluciones y recoger herramientas." />
            <Row icon="⚪" label="Empleado" desc="Puede ver todo el inventario, historial, préstamos y proyectos. No puede modificar datos ni registrar salidas." />
        </Section>

        {/* Configuración */}
        <Section icon="⚙️" title="Configuración">
            <p className="pt-3">Botón ⚙️ en la parte inferior del menú lateral:</p>
            <Row icon="🛒" label="Módulo de Compras" desc="Activa el tab de órdenes de compra en el Kardex." />
            <Row icon="💰" label="Valores económicos" desc="Muestra costos en pesos en el detalle de proyectos y materiales." />
        </Section>

        {/* PDF */}
        <Section icon="📄" title="Exportar informe PDF">
            <p className="pt-3">En la pantalla <strong>Resumen</strong>, botón <em>Exportar informe PDF</em>. El informe incluye indicadores, préstamos activos, herramientas, consumibles y actividad por proyecto.</p>
        </Section>

        {/* FAQ */}
        <Section icon="❓" title="Preguntas frecuentes">
            <div className="pt-2 space-y-4">
                <div>
                    <p className="font-bold text-gray-800">¿Cómo marco una herramienta como devuelta?</p>
                    <p>En Kardex → Préstamos → botón "✓ Devuelta" junto al ítem. Se registra la condición en que regresó (buena, dañada, etc.).</p>
                </div>
                <div>
                    <p className="font-bold text-gray-800">¿Qué diferencia hay entre préstamo y salida?</p>
                    <p>Las herramientas (Manual y Eléctrica) son préstamos — aparecen en Préstamos y se espera que vuelvan. Los consumibles y EPP son salidas definitivas sin devolución.</p>
                </div>
                <div>
                    <p className="font-bold text-gray-800">¿Cómo asigno una herramienta a un trabajador de una cuadrilla?</p>
                    <p>Usa el chatbot → 🚀 Despacho o ⚡ Rápido → elige al oficial → aparece automáticamente el selector de sub-trabajador de su cuadrilla.</p>
                </div>
                <div>
                    <p className="font-bold text-gray-800">¿Puedo registrar una salida de una fecha anterior?</p>
                    <p>Sí. En el paso de confirmación del Despacho hay un campo de fecha — cámbiala a la fecha real del movimiento.</p>
                </div>
                <div>
                    <p className="font-bold text-gray-800">¿Qué pasa si elimino algo por error?</p>
                    <p>Los datos se sincronizan con la nube. Si borraste algo sin querer, contacta al administrador del sistema para recuperarlo desde la base de datos.</p>
                </div>
                <div>
                    <p className="font-bold text-gray-800">¿Los datos se guardan automáticamente?</p>
                    <p>Sí. Cada cambio se guarda al instante, tanto localmente como en la nube. El indicador <em>"Guardando…"</em> en el encabezado confirma la sincronización.</p>
                </div>
            </div>
        </Section>
    </div>
);
