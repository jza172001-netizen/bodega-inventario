import React from 'react';
import { CATEGORIAS, type ResumenLinea } from '../core/verificacion';

/**
 * El paso final del bloque, por trabajador: «¿este es el pedido correcto?».
 *
 * Es el mismo «Confirmar» de 🚀 Despacho en el chat —trabajador, proyecto y
 * artículos con cantidad, unidad y Préstamo— porque el bloque tiene que hacer
 * lo mismo que el chat. Solo se registran los trabajadores confirmados; lo que
 * todavía hay que decidir se nombra aparte y no sale aunque se confirme.
 *
 * Solo pinta. La cuenta de qué sale la hace `resumenDeLinea` (core/verificacion.ts).
 */
interface Props {
    trabajador: string;
    /** «cuadrilla de Alex», «Juan, de la cuadrilla de Alex», etc. */
    detalle?: string;
    obra: string;
    cuando?: string;
    resumen: ResumenLinea;
    confirmado: boolean;
    onConfirmar: () => void;
    onEditar: () => void;
}

type Fila = ResumenLinea['sale'][number];

/** Consumibles, manuales, eléctricas, EPP —en ese orden— y lo demás al final. */
const gruposDe = (sale: Fila[]): Array<[string, Fila[]]> => {
    const conocidos = new Set(CATEGORIAS.map(([t]) => t));
    const grupos: Array<[string, Fila[]]> = CATEGORIAS.map(([t, titulo]) => [titulo, sale.filter(s => s.tipo === t)]);
    grupos.push(['Otros', sale.filter(s => !s.tipo || !conocidos.has(s.tipo))]);
    return grupos.filter(([, filas]) => filas.length > 0);
};

export const ResumenTrabajador: React.FC<Props> = ({ trabajador, detalle, obra, cuando, resumen, confirmado, onConfirmar, onEditar }) => (
    <div className={`rounded-xl border p-2.5 space-y-1.5 ${confirmado ? 'border-bien bg-bien-suave' : 'border-papel-borde bg-papel-hondo'}`}>
        <div className="space-y-0.5 text-[11px]">
            <div className="flex gap-2"><span className="text-tinta-tenue w-16 flex-shrink-0">Trabajador</span><span className="font-bold text-tinta">{trabajador}{detalle ? ` · ${detalle}` : ''}</span></div>
            <div className="flex gap-2"><span className="text-tinta-tenue w-16 flex-shrink-0">Proyecto</span><span className="font-bold text-tinta">{obra}</span></div>
            {cuando && <div className="flex gap-2"><span className="text-tinta-tenue w-16 flex-shrink-0">Cuándo</span><span className="font-bold text-tinta">{cuando}</span></div>}
        </div>

        {/* Agrupado como el bloque: solo las categorías que traen algo. */}
        {gruposDe(resumen.sale).map(([titulo, filas]) => (
            <div key={titulo} className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-wide text-tinta-tenue">{titulo}</p>
                {filas.map(s => (
                    <div key={s.itemLoteId} className="text-[11px] px-2 py-1 rounded-lg bg-papel border border-papel-borde">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-tinta-suave flex-shrink-0">{s.cantidad} {s.unidad}</span>
                            <span className="text-tinta-suave truncate flex-1">{s.nombre}{s.nuevo ? ' (nuevo)' : ''}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${s.prestamo ? 'bg-atencion-suave text-atencion' : 'bg-papel-hondo text-tinta-tenue'}`}>
                                {s.prestamo ? 'Préstamo' : 'Gasto'}
                            </span>
                        </div>
                        {s.accesorios.length > 0 && <p className="text-[10px] text-tinta-tenue pl-1">sale con: {s.accesorios.join(', ')}</p>}
                        {s.avisos.map((a, i) => <p key={i} className="text-[10px] text-atencion pl-1">⚠ {a}</p>)}
                    </div>
                ))}
            </div>
        ))}

        {resumen.seQueda.length > 0 && (
            <div className="text-[10px] text-atencion space-y-0.5">
                <p className="font-black">Se queda en pantalla (falta decidir):</p>
                {resumen.seQueda.map(q => <p key={q.itemLoteId}>· {q.nombre}: {q.porque}</p>)}
            </div>
        )}

        {confirmado ? (
            <div className="flex items-center gap-2">
                <span className="text-[11px] font-black text-bien flex-1">✓ Pedido correcto</span>
                <button type="button" onClick={onEditar}
                    className="px-3 py-1 text-[11px] font-bold text-tinta-suave border border-papel-borde bg-papel rounded-lg">
                    ← Editar
                </button>
            </div>
        ) : (
            <button type="button" onClick={onConfirmar} disabled={resumen.sale.length === 0}
                className="w-full py-2 text-xs font-black bg-bien text-papel rounded-xl disabled:opacity-40">
                {resumen.sale.length > 0 ? `✓ Pedido correcto (${resumen.sale.length})` : 'Falta decidir antes de confirmar'}
            </button>
        )}
    </div>
);

export default ResumenTrabajador;
