import React, { useState } from 'react';

interface Section {
    id: string;
    icon: string;
    title: string;
    content: React.ReactNode;
}

const Chip: React.FC<{ label: string }> = ({ label }) => (
    <span className="inline-block bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-lg mr-1">{label}</span>
);

const Step: React.FC<{ n: number; text: string }> = ({ n, text }) => (
    <div className="flex gap-3 items-start">
        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-xs font-black rounded-full flex items-center justify-center">{n}</span>
        <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
    </div>
);

const Tip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3">
        <p className="text-xs text-amber-800 leading-relaxed">💡 {children}</p>
    </div>
);

const Row: React.FC<{ icon: string; label: string; desc: string }> = ({ icon, label, desc }) => (
    <div className="flex gap-3 p-3 bg-gray-50 rounded-xl">
        <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
        <div>
            <p className="text-sm font-bold text-gray-800">{label}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
        </div>
    </div>
);

const SECTIONS: Section[] = [
    {
        id: 'intro',
        icon: '🏠',
        title: '¿Para qué sirve esta app?',
        content: (
            <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                    <strong>Bodega Pro</strong> te ayuda a controlar qué materiales, herramientas y equipos <strong>salen</strong> de tu bodega — quién los tiene, cuánto se ha consumido y en qué proyecto.
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                    No es un sistema contable ni de facturación. Es un <strong>libro de salidas</strong> digital que con el tiempo te da estadísticas muy valiosas sobre consumo y productividad.
                </p>
                <Tip>El único hábito que necesitas: cada vez que alguien saque algo de la bodega, lo registras en el Asistente.</Tip>
            </div>
        ),
    },
    {
        id: 'menu',
        icon: '📋',
        title: 'El menú lateral — ¿qué hace cada botón?',
        content: (
            <div className="space-y-2">
                <Row icon="🏠" label="Resumen" desc="Tu panel principal con estadísticas, alertas de stock bajo y los materiales más consumidos." />
                <Row icon="🤖" label="Análisis (Asistente)" desc="El chatbot inteligente. Escribe en español para registrar salidas, crear proyectos, trabajadores e ítems." />
                <Row icon="📜" label="Kardex" desc="El historial completo de todos los movimientos. Filtra por fecha, tipo o ítem." />
                <Row icon="🔑" label="Préstamos" desc="Herramientas que están actualmente fuera de la bodega. Márcalas como devueltas aquí." />
                <Row icon="🏗️" label="Proyectos" desc="Cuántos materiales se han consumido en cada proyecto de obra." />
                <Row icon="👷" label="Personal" desc="Lista de trabajadores. Toca una tarjeta para ver préstamos activos y consumo del año." />
                <Row icon="🛒" label="Compras" desc="Órdenes de compra a proveedores: créalas, apruébalas y márcalas recibidas." />
                <Row icon="❓" label="Ayuda" desc="Esta pantalla. Siempre disponible para resolver dudas." />
            </div>
        ),
    },
    {
        id: 'inventories',
        icon: '📦',
        title: 'Los 4 tipos de inventario',
        content: (
            <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">La app divide todo en 4 tipos. Es importante porque cada uno se maneja diferente:</p>
                <div className="space-y-2">
                    <Row icon="🔨" label="Herramienta Manual" desc="Llaves, martillos, palas… Se prestan y DEBEN devolverse. Siempre marca '¿Es préstamo?' al registrar la salida." />
                    <Row icon="⚡" label="Herramienta Eléctrica" desc="Taladros, esmeriles, sierras… Seguimiento estricto. Siempre sabrás quién tiene qué equipo." />
                    <Row icon="🦺" label="Seguridad (EPP)" desc="Cascos, guantes, gafas, chalecos… Se entrega y normalmente no regresa. Solo registra la entrega." />
                    <Row icon="📦" label="Consumibles" desc="Tornillos, cemento, cable, PVC… Se usa y no vuelve. Lo importante es llevar el conteo de cuánto sale." />
                </div>
                <Tip>Para Eléctrica y Manual activa la opción de préstamo. Para EPP y Consumibles normalmente no.</Tip>
            </div>
        ),
    },
    {
        id: 'chatbot',
        icon: '🤖',
        title: 'Cómo usar el Asistente (chatbot)',
        content: (
            <div className="space-y-4">
                <p className="text-sm text-gray-600 leading-relaxed">
                    El Asistente entiende español natural. En lugar de llenar formularios, escribe lo que pasó.
                </p>

                <div>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Registrar una salida</p>
                    <div className="space-y-1">
                        <Step n={1} text='Escribe en el chat: "saqué 30 tornillos 2 pulgadas y 2 taladros para proyecto Torre 5, trabajador Pedro"' />
                        <Step n={2} text="El sistema muestra una tarjeta de confirmación con los ítems detectados." />
                        <Step n={3} text='Si algo no se encontró, el sistema te pide aclarar o crea el ítem nuevo con el botón "+ Crear".' />
                        <Step n={4} text='Toca "✅ Confirmar" y los movimientos quedan registrados.' />
                    </div>
                </div>

                <div>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Crear entidades nuevas</p>
                    <div className="space-y-1.5">
                        <div className="flex gap-2 items-start">
                            <Chip label="Proyecto" />
                            <p className="text-sm text-gray-600">"crea el proyecto Edificio Centro"</p>
                        </div>
                        <div className="flex gap-2 items-start">
                            <Chip label="Trabajador" />
                            <p className="text-sm text-gray-600">"añade al trabajador Miguel Torres"</p>
                        </div>
                        <div className="flex gap-2 items-start">
                            <Chip label="Ítem" />
                            <p className="text-sm text-gray-600">"añade el ítem Casco de Seguridad"</p>
                        </div>
                    </div>
                </div>

                <div>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Consultas rápidas</p>
                    <div className="space-y-1 text-sm text-gray-600">
                        <p>• "¿qué herramientas están prestadas?"</p>
                        <p>• "¿qué tiene stock bajo?"</p>
                        <p>• "resumen de consumo de este mes"</p>
                    </div>
                </div>

                <Tip>Si el trabajador o el ítem no existen al registrar una salida, la tarjeta de confirmación te ofrece crearlos en ese momento, sin salir del chat.</Tip>
            </div>
        ),
    },
    {
        id: 'loans',
        icon: '🔑',
        title: 'Préstamos y devoluciones',
        content: (
            <div className="space-y-3">
                <div className="space-y-1">
                    <Step n={1} text='Al registrar la salida de una herramienta, marca la opción "¿Es préstamo?" (en el formulario o escríbelo en el chat).' />
                    <Step n={2} text='Cuando la herramienta regresa a la bodega, ve a "Préstamos" en el menú.' />
                    <Step n={3} text='Busca el ítem en la lista y toca "Devolver". El sistema lo marca como retornado.' />
                </div>
                <Tip>Los ítems en rojo llevan más de 14 días fuera. En amarillo, más de 7 días. Son señales de que hay que hacer seguimiento.</Tip>
            </div>
        ),
    },
    {
        id: 'clip',
        icon: '📎',
        title: 'Importar facturas y listas (clip)',
        content: (
            <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                    El ícono de clip 🖇️ en la barra superior te permite importar listas de materiales desde documentos.
                </p>
                <div className="space-y-2">
                    <Row icon="📄" label="PDF" desc="Sube una factura o remisión. El sistema extrae los productos automáticamente." />
                    <Row icon="📊" label="Excel o CSV" desc="Importa planillas de inventario antiguas. Detecta columnas de nombre, cantidad y unidad." />
                    <Row icon="📝" label="Word (.docx) o Texto" desc="Pega texto directamente o sube un documento Word con listas de materiales." />
                </div>
                <Tip>Pon siempre el tipo de inventario en el título del documento: "Inventario EPP Marzo 2025". El sistema detecta la categoría automáticamente.</Tip>
            </div>
        ),
    },
    {
        id: 'personnel',
        icon: '👷',
        title: 'Perfil del trabajador',
        content: (
            <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                    Ve a <strong>Personal</strong> y toca la tarjeta de cualquier trabajador para abrir su perfil completo.
                </p>
                <div className="space-y-2">
                    <Row icon="🔴" label="Activo" desc="Herramientas que tiene prestadas ahora mismo y hace cuántos días las tiene." />
                    <Row icon="📅" label="Préstamos del año" desc="Historial de préstamos de este año: qué recibió, cuándo y si ya lo devolvió." />
                    <Row icon="📊" label="Consumo del año" desc="Materiales retirados (EPP y consumibles) agrupados por ítem y proyecto." />
                </div>
            </div>
        ),
    },
    {
        id: 'faq',
        icon: '❓',
        title: 'Preguntas frecuentes',
        content: (
            <div className="space-y-4">
                {[
                    {
                        q: '¿Qué pasa si escribo el nombre de un ítem que no existe en el chat?',
                        a: 'El sistema te avisa y ofrece un botón "+ Crear ítem" directamente en la tarjeta de confirmación. No tienes que salir del chat.',
                    },
                    {
                        q: '¿Puedo usar la app sin internet?',
                        a: 'Sí. La app guarda los datos localmente en el navegador. Cuando recuperes conexión, los cambios se sincronizan a la nube automáticamente.',
                    },
                    {
                        q: '¿Cómo sé si un ítem está bajo de stock?',
                        a: 'En el Resumen aparece la sección "Alertas de stock bajo" con todos los ítems que están por debajo de su mínimo configurado. También se ve en el inventario con una etiqueta roja.',
                    },
                    {
                        q: '¿Puedo importar el inventario que ya tenía en Excel?',
                        a: 'Sí. Usa el clip 🖇️ en la barra superior, selecciona tu archivo .xlsx y el sistema detecta automáticamente las columnas de nombre, cantidad y unidad.',
                    },
                    {
                        q: '¿Cómo veo todo lo que ha consumido un proyecto?',
                        a: 'Ve a Proyectos en el menú y selecciona el proyecto. Verás un resumen de todos los materiales utilizados.',
                    },
                    {
                        q: '¿Dónde veo el historial completo de movimientos?',
                        a: 'En "Kardex" tienes todos los movimientos con filtros por ítem, trabajador, proyecto y fecha.',
                    },
                ].map(({ q, a }) => (
                    <div key={q} className="border border-gray-100 rounded-xl p-4">
                        <p className="text-sm font-bold text-gray-800 mb-1.5">{q}</p>
                        <p className="text-sm text-gray-500 leading-relaxed">{a}</p>
                    </div>
                ))}
            </div>
        ),
    },
];

export const HelpView: React.FC = () => {
    const [activeSection, setActiveSection] = useState<string>('intro');
    const current = SECTIONS.find(s => s.id === activeSection) ?? SECTIONS[0];

    return (
        <div className="flex flex-col md:flex-row gap-4 h-full max-h-[calc(100vh-7rem)]">
            {/* Sidebar nav */}
            <div className="md:w-56 flex-shrink-0">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 space-y-1 md:sticky md:top-0">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-3 pt-1 pb-2">Secciones</p>
                    {SECTIONS.map(s => (
                        <button
                            key={s.id}
                            onClick={() => setActiveSection(s.id)}
                            className={`w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeSection === s.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            <span>{s.icon}</span>
                            <span className="truncate">{s.title}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full overflow-y-auto">
                    <div className="flex items-center gap-3 mb-5">
                        <span className="text-3xl">{current.icon}</span>
                        <h2 className="text-xl font-black text-gray-900">{current.title}</h2>
                    </div>
                    {current.content}
                </div>
            </div>
        </div>
    );
};
