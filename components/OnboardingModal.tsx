import React, { useState } from 'react';

interface OnboardingModalProps {
    onFinish: () => void;
}

interface Step {
    icon: string;
    title: string;
    intro?: string;
    items?: { icon: string; label: string; desc: string }[];
    tip?: string;
}

const STEPS: Step[] = [
    {
        icon: '👋',
        title: 'Bienvenido a Bodega Pro',
        intro: 'Esta app te ayuda a controlar qué materiales, herramientas y equipos salen de tu bodega — quién los tiene, cuánto se ha consumido y en qué proyecto.\n\nNo necesitas ser experto en sistemas. Si sabes mandar un mensaje de texto, sabes usar esto.',
        tip: '💡 El objetivo es simple: cada vez que alguien saque algo de la bodega, lo registras aquí. Con el tiempo tendrás estadísticas muy valiosas.',
    },
    {
        icon: '📋',
        title: 'El menú de la izquierda — ¿qué hay?',
        intro: 'Todo está organizado en el menú lateral. Aquí un resumen rápido:',
        items: [
            { icon: '🏠', label: 'Resumen', desc: 'Tu panel principal. Muestra estadísticas, alertas de stock bajo y qué se ha consumido más.' },
            { icon: '🤖', label: 'Análisis (Asistente)', desc: 'El chatbot inteligente. Puedes registrar salidas, crear proyectos y trabajadores solo escribiendo.' },
            { icon: '📜', label: 'Kardex', desc: 'El historial completo de todos los movimientos. Filtra por tipo de inventario.' },
            { icon: '🔑', label: 'Préstamos', desc: 'Lista de herramientas que están actualmente fuera. Marca cuándo las devuelven.' },
            { icon: '🏗️', label: 'Proyectos', desc: 'Ver cuántos materiales se han usado en cada proyecto de obra.' },
            { icon: '👷', label: 'Personal', desc: 'Toca un trabajador para ver sus préstamos activos y consumo del año.' },
            { icon: '🛒', label: 'Compras', desc: 'Órdenes de compra a proveedores: créalas, llévalas y márcalas recibidas.' },
        ],
    },
    {
        icon: '📦',
        title: 'Los 4 inventarios — cada cosa en su lugar',
        intro: 'La app divide el inventario en 4 tipos. Esto es importante porque cada uno se maneja diferente:',
        items: [
            { icon: '🔨', label: 'Herramienta Manual', desc: 'Llaves, martillos, palas, alicates… Se prestan y deben devolverse. Marca si es préstamo al registrar la salida.' },
            { icon: '⚡', label: 'Herramienta Eléctrica', desc: 'Taladros, esmeriles, sierras… Seguimiento estricto. Siempre sabrás quién tiene qué equipo eléctrico.' },
            { icon: '🦺', label: 'Seguridad (EPP)', desc: 'Cascos, guantes, gafas, chalecos… Normalmente se entrega y no regresa. Registra cada entrega.' },
            { icon: '📦', label: 'Consumibles', desc: 'Tornillos, cemento, PVC, cable… Material que se usa y no vuelve. Lo importante es llevar el conteo de salidas.' },
        ],
        tip: '💡 Para Eléctrica y Manual usa la opción "¿Es préstamo?" al registrar salidas. Para EPP y Consumibles normalmente no.',
    },
    {
        icon: '🤖',
        title: 'El Asistente — tu herramienta estrella',
        intro: 'En lugar de llenar formularios, escribe en lenguaje natural. El sistema entiende español.',
        items: [
            { icon: '📤', label: 'Registrar una salida', desc: '"saqué 5 cascos y 2 taladros para proyecto Torre 5, trabajador Pedro" → El sistema crea los movimientos automáticamente.' },
            { icon: '🏗️', label: 'Crear un proyecto nuevo', desc: '"crea el proyecto Edificio Centro" → El proyecto queda disponible de inmediato.' },
            { icon: '👷', label: 'Agregar un trabajador', desc: '"añade al trabajador Miguel Torres" → Aparece en la lista de personal.' },
            { icon: '📦', label: 'Agregar un ítem', desc: '"añade el ítem Casco de Seguridad" → Si el sistema no detecta el tipo, te pregunta cuál es.' },
            { icon: '❓', label: 'Consultas rápidas', desc: '"¿qué herramientas están prestadas?" / "¿qué tiene stock bajo?" — el asistente responde en segundos.' },
        ],
        tip: '💡 Si el producto o el trabajador no existen al registrar una salida, la tarjeta de confirmación te ofrece crearlos en ese momento.',
    },
    {
        icon: '📎',
        title: 'El clip — importar facturas y listas',
        intro: 'El ícono de clip 🖇️ en la barra superior te permite importar documentos con listas de materiales.',
        items: [
            { icon: '📄', label: 'PDF', desc: 'Sube una factura o remisión en PDF. El sistema extrae los productos automáticamente.' },
            { icon: '📊', label: 'Excel o CSV', desc: 'Importa planillas de inventario antiguas. Detecta columnas de nombre, cantidad y unidad.' },
            { icon: '📝', label: 'Word (.docx) o Texto', desc: 'Pega texto directamente o sube un documento Word con listas de materiales.' },
            { icon: '🦺', label: 'Categoría automática', desc: 'Si el título del documento dice "Inventario EPP" o "Herramienta Eléctrica", el sistema asigna el tipo correcto a todos los ítems.' },
        ],
        tip: '💡 Pon siempre el tipo de inventario en el título de tus documentos: "Inventario Consumibles Marzo 2025". El sistema lo detecta solo.',
    },
    {
        icon: '👷',
        title: 'Perfil del trabajador',
        intro: 'Ve a Personal y toca cualquier tarjeta de trabajador para ver su historial completo.',
        items: [
            { icon: '🔴', label: 'Activo', desc: 'Muestra qué herramientas tiene prestadas en este momento y hace cuántos días las tiene.' },
            { icon: '📅', label: 'Préstamos del año', desc: 'Historial de todos los préstamos de este año: qué recibió, cuándo y si ya lo devolvió.' },
            { icon: '📊', label: 'Consumo del año', desc: 'Todos los materiales (EPP y consumibles) que ha retirado este año, agrupados por ítem y proyecto.' },
        ],
        tip: '💡 Si un trabajador tiene ítems en rojo (más de 14 días fuera), es una señal de que hay que hacer seguimiento.',
    },
    {
        icon: '🎉',
        title: '¡Todo listo! Empieza a usarla',
        intro: 'Recuerda los pasos clave para que la app funcione bien:\n\n① Cada vez que alguien saque algo, regístralo en el Asistente escribiendo naturalmente.\n\n② Al registrar herramientas manuales o eléctricas, marca si es préstamo.\n\n③ Cuando devuelvan algo, ve a Préstamos y márcalo como devuelto.\n\n④ Si tienes datos históricos en Excel o PDF, impórtalos con el clip 📎.',
        tip: '💡 Puedes volver a ver este tutorial en cualquier momento desde el menú Ayuda ❓ en la barra lateral.',
    },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onFinish }) => {
    const [step, setStep] = useState(0);
    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;
    const isFirst = step === 0;

    return (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
                {/* Progress */}
                <div className="px-6 pt-5 pb-3">
                    <div className="flex gap-1.5 mb-1">
                        {STEPS.map((_, i) => (
                            <div key={i} className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${i <= step ? 'bg-blue-500' : 'bg-gray-200'}`} />
                        ))}
                    </div>
                    <p className="text-[10px] text-gray-400 font-semibold text-right">Paso {step + 1} de {STEPS.length}</p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 pb-2">
                    <div className="text-5xl mb-3 text-center">{current.icon}</div>
                    <h2 className="text-xl font-black text-gray-900 text-center mb-4">{current.title}</h2>

                    {current.intro && (
                        <p className="text-sm text-gray-600 leading-relaxed mb-4 whitespace-pre-line">{current.intro}</p>
                    )}

                    {current.items && (
                        <div className="space-y-2.5 mb-4">
                            {current.items.map((item, i) => (
                                <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-xl">
                                    <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                                    <div>
                                        <p className="text-sm font-bold text-gray-800">{item.label}</p>
                                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {current.tip && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-2">
                            <p className="text-xs text-blue-700 leading-relaxed">{current.tip}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
                    {!isFirst ? (
                        <button onClick={() => setStep(s => s - 1)} className="text-sm text-gray-400 hover:text-gray-600 font-semibold px-3 py-2">
                            ← Anterior
                        </button>
                    ) : (
                        <button onClick={onFinish} className="text-sm text-gray-400 hover:text-gray-500 font-semibold px-3 py-2">
                            Saltar tutorial
                        </button>
                    )}
                    <button
                        onClick={() => isLast ? onFinish() : setStep(s => s + 1)}
                        className="flex-1 max-w-[200px] py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all"
                    >
                        {isLast ? '¡Empezar a usar la app! 🚀' : 'Siguiente →'}
                    </button>
                </div>
            </div>
        </div>
    );
};
