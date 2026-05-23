import React, { useState } from 'react';

const Section: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => {
    const [open, setOpen] = useState(true);
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

export const HelpView: React.FC = () => (
    <div className="space-y-4 max-w-2xl mx-auto">
        <div className="text-center py-4">
            <p className="text-2xl font-black text-gray-900 uppercase tracking-tight">Centro de ayuda</p>
            <p className="text-sm text-gray-400 mt-1">Guía rápida de uso — Bodega Montecielo</p>
        </div>

        <Section icon="🏠" title="El menú lateral — ¿qué hay?">
            <p className="pt-3">El menú tiene solo 3 secciones principales:</p>
            <Row icon="🏠" label="Resumen" desc="Panel principal con estadísticas, alertas y todo el inventario. Toca cualquier cifra para ver el detalle." />
            <Row icon="👷" label="Personal" desc="Lista de trabajadores. Aquí añades, editas y ves qué tiene cada quien." />
            <Row icon="📋" label="Kardex" desc="El corazón del inventario. Tiene 4 pestañas internas: Historial, Préstamos, Inventario y Proyectos." />
        </Section>

        <Section icon="📋" title="El Kardex — 4 pestañas">
            <Row icon="📋" label="Historial" desc="Todos los movimientos registrados: compras, entradas, salidas y mermas. Solo el Bodeguero puede eliminar registros." />
            <Row icon="🔑" label="Préstamos" desc="Herramientas actualmente fuera de bodega. Agrupa por urgencia: más de 14 días 🔴, entre 7 y 14 🟡, al día 🟢. Botón 📲 para recordar al trabajador por WhatsApp." />
            <Row icon="📦" label="Inventario" desc="Todo el catálogo con filtros por tipo: H. Manual, H. Eléctrica, Seguridad, Consumibles. Toca cualquier ítem para ver su historial." />
            <Row icon="🏗" label="Proyectos" desc="Obras activas con detalle de personal involucrado, herramientas prestadas y materiales consumidos." />
        </Section>

        <Section icon="🚀" title="Registrar una salida o préstamo">
            <p className="pt-3">Usa el <strong>botón azul flotante 💬</strong> en la esquina inferior derecha (solo el Bodeguero lo ve). Sigue los 4 pasos:</p>
            <Row icon="1️⃣" label="Tipo" desc="Selecciona qué tipo de ítem sale: herramienta manual, eléctrica, seguridad o consumible." />
            <Row icon="2️⃣" label="Trabajador" desc="Elige quién lo lleva (o crea uno nuevo si no está en la lista)." />
            <Row icon="3️⃣" label="Proyecto" desc="Asigna la obra si aplica (opcional)." />
            <Row icon="4️⃣" label="Ítems" desc='Escribe los ítems y cantidades, por ejemplo: "2 discos de corte, 1 taladro". Confirma y se registra todo.' />
        </Section>

        <Section icon="🔍" title="Búsqueda global">
            <p className="pt-3">Toca el ícono 🔍 en la parte superior derecha del header. Escribe al menos 2 caracteres y aparecerán los ítems que coincidan:</p>
            <Row icon="📦" label="Nombre del ítem" desc="Busca por nombre o subcategoría." />
            <Row icon="👷" label="Tenedor activo" desc="Si el ítem está en préstamo, muestra quién lo tiene." />
            <Row icon="📅" label="Último movimiento" desc="Fecha del último registro asociado al ítem." />
        </Section>

        <Section icon="📲" title="Recordatorios por WhatsApp">
            <p className="pt-3">En la pestaña <strong>Préstamos</strong> del Kardex, cada tarjeta con número de teléfono guardado muestra un botón 📲.</p>
            <p>Al tocarlo, WhatsApp se abre con el mensaje ya escrito: nombre del trabajador, ítem y días transcurridos. Solo tocar Enviar.</p>
            <p className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs font-semibold text-blue-700">
                💡 Para que funcione, agrega el número de teléfono al crear o editar un trabajador en la sección Personal.
            </p>
        </Section>

        <Section icon="👥" title="Roles de usuario">
            <Row icon="🔵" label="Bodeguero" desc="Acceso completo: crear, editar, eliminar ítems, registrar movimientos, marcar préstamos como devueltos, usar el chatbot wizard." />
            <Row icon="⚪" label="Visitante" desc="Solo lectura. Puede ver todo el inventario, historial y proyectos, pero no puede modificar nada ni registrar salidas." />
            <p className="text-xs text-gray-400 pt-1">Al entrar, toca el botón del rol que quieres usar — sin contraseña.</p>
        </Section>

        <Section icon="⚙️" title="Configuración">
            <p className="pt-3">Botón ⚙️ en la parte inferior del menú lateral. Desde ahí puedes activar o desactivar:</p>
            <Row icon="🛒" label="Módulo de Compras" desc="Activa el tab de órdenes de compra en el Kardex." />
            <Row icon="💰" label="Valores económicos" desc="Muestra costos en pesos en el detalle de proyectos y materiales consumidos." />
        </Section>

        <Section icon="📄" title="Exportar informe PDF">
            <p className="pt-3">En la pantalla <strong>Resumen</strong>, botón <em>Exportar informe PDF</em>. Elige el período y el informe incluye:</p>
            <Row icon="📊" label="Indicadores" desc="Ítems, despachos, préstamos activos, stock bajo mínimo." />
            <Row icon="📝" label="Resumen ejecutivo" desc="Párrafo de prosa generado automáticamente con los datos clave." />
            <Row icon="👷" label="Personal en préstamo" desc="Tabla con quién tiene qué y hace cuántos días." />
            <Row icon="🔨" label="Herramientas" desc="Estado de todos los equipos: disponible, prestado o vencido." />
            <Row icon="📦" label="Consumibles" desc="Materiales usados en el período con cantidades." />
            <Row icon="🏗" label="Proyectos" desc="Actividad por obra: despachos y trabajadores involucrados." />
        </Section>

        <Section icon="❓" title="Preguntas frecuentes">
            <div className="pt-2 space-y-4">
                <div>
                    <p className="font-bold text-gray-800">¿Cómo marco una herramienta como devuelta?</p>
                    <p>En Kardex → Préstamos, toca el botón "✓ Devuelta". Solo visible para el Bodeguero.</p>
                </div>
                <div>
                    <p className="font-bold text-gray-800">¿Qué diferencia hay entre préstamo y salida?</p>
                    <p>Las herramientas (Manual y Eléctrica) son préstamos — se espera que vuelvan. Los consumibles (tornillos, cemento, etc.) son salidas definitivas.</p>
                </div>
                <div>
                    <p className="font-bold text-gray-800">¿Puedo exportar e importar mis datos?</p>
                    <p>Sí. En el encabezado (botones Exportar / Importar, visible en escritorio) puedes guardar todo como JSON y restaurarlo en otro dispositivo.</p>
                </div>
                <div>
                    <p className="font-bold text-gray-800">¿Qué significa "stock mínimo"?</p>
                    <p>Es el umbral de alerta. Si el stock cae por debajo, el ítem aparece como "BAJO". Si llega a 0, como "AGOTADO".</p>
                </div>
                <div>
                    <p className="font-bold text-gray-800">¿Los datos se guardan automáticamente?</p>
                    <p>Sí. Cada cambio se guarda al momento. El indicador "Guardando..." en el encabezado confirma la sincronización.</p>
                </div>
            </div>
        </Section>
    </div>
);
