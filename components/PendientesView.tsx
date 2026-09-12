/**
 * components/PendientesView.tsx — La bandeja de lo que no se guardó
 * =================================================================
 * LA PROMESA DE ESTA PANTALLA: **nada desaparece en silencio.**
 *
 * Antes, una escritura que fallaba se anunciaba con el indicador en rojo ocho
 * segundos y nada más. No quedaba anotada en ninguna parte y no se volvía a
 * intentar nunca: el movimiento estaba en el teléfono y **no estaba en la bodega
 * compartida**, y nadie se enteraba hasta que los dos celulares mostraban cosas
 * distintas. Un rojo de ocho segundos a las siete de la mañana no lo ve nadie.
 *
 * Acá está todo lo que la app hizo y el servidor todavía no confirmó, con tres
 * cosas que se pueden hacer con cada uno: **esperar** (se reintenta solo),
 * **reintentar ya**, o **descartar diciendo por qué**.
 *
 * Descartar pide motivo a propósito. Un pendiente que se borra sin explicación
 * es exactamente el agujero que esta pantalla existe para tapar.
 */

import React, { useState } from 'react';
import { Operacion, LIMITE_INTENTOS } from '../core/cola';

interface PendientesViewProps {
    pendientes: Operacion[];
    onReintentar: (id: string) => void;
    onDescartar: (id: string, motivo: string) => void;
    onGoBack?: () => void;
}

const cuando = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const PendientesView: React.FC<PendientesViewProps> = ({
    pendientes, onReintentar, onDescartar, onGoBack,
}) => {
    const [descartando, setDescartando] = useState<string | null>(null);
    const [motivo, setMotivo] = useState('');

    const bloqueados = pendientes.filter(o => o.bloqueada);
    const enEspera = pendientes.filter(o => !o.bloqueada);

    const confirmarDescarte = (id: string) => {
        onDescartar(id, motivo.trim());
        setDescartando(null);
        setMotivo('');
    };

    const tarjeta = (o: Operacion) => (
        <div key={o.id}
             className={`rounded-2xl border p-3 ${o.bloqueada ? 'border-alerta bg-alerta-suave' : 'border-papel-borde bg-papel'}`}>
            <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-black text-tinta">{o.descripcion}</p>
                <span className="text-[11px] text-tinta-tenue whitespace-nowrap">{cuando(o.creadaEn)}</span>
            </div>

            <p className="text-[11px] text-tinta-tenue mt-1">
                {o.bloqueada
                    ? `Se intentó ${o.intentos} veces y dejó de intentarse solo. Necesita que alguien decida.`
                    : o.intentos === 0
                        ? 'Esperando turno para subir.'
                        : `Intentado ${o.intentos} de ${LIMITE_INTENTOS} veces. Se sigue intentando solo.`}
            </p>

            {o.ultimoError && (
                <p className="text-[11px] text-alerta mt-1 break-words">
                    Lo que respondió el servidor: {o.ultimoError}
                </p>
            )}

            {descartando === o.id ? (
                <div className="mt-2 space-y-2">
                    <input
                        autoFocus
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        placeholder="¿Por qué no va? (ej: ya se registró a mano)"
                        className="w-full text-[11px] border border-papel-borde rounded-lg px-2 py-1.5 bg-papel text-tinta"
                    />
                    <div className="flex gap-2">
                        <button onClick={() => confirmarDescarte(o.id)}
                                className="text-[11px] font-black px-3 py-1.5 rounded-lg bg-alerta text-white">
                            Descartar
                        </button>
                        <button onClick={() => { setDescartando(null); setMotivo(''); }}
                                className="text-[11px] px-3 py-1.5 rounded-lg border border-papel-borde text-tinta">
                            Dejarlo
                        </button>
                    </div>
                    <p className="text-[10px] text-tinta-tenue">
                        Queda en la bitácora con el motivo. Descartar no lo registra en la bodega.
                    </p>
                </div>
            ) : (
                <div className="flex gap-2 mt-2">
                    <button onClick={() => onReintentar(o.id)}
                            className="text-[11px] font-black px-3 py-1.5 rounded-lg bg-marca text-white">
                        Reintentar ya
                    </button>
                    <button onClick={() => setDescartando(o.id)}
                            className="text-[11px] px-3 py-1.5 rounded-lg border border-papel-borde text-tinta">
                        Descartar…
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="p-4 space-y-4 max-w-2xl mx-auto">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-black text-tinta">Pendientes de subir</h2>
                    <p className="text-[11px] text-tinta-tenue mt-0.5">
                        Lo que la app hizo y el servidor todavía no confirmó. Nada de esto se pierde:
                        se reintenta solo cuando vuelva la señal.
                    </p>
                </div>
                {onGoBack && (
                    <button onClick={onGoBack}
                            className="text-[11px] px-3 py-1.5 rounded-lg border border-papel-borde text-tinta whitespace-nowrap">
                        Volver
                    </button>
                )}
            </div>

            {pendientes.length === 0 && (
                <div className="rounded-2xl border border-papel-borde bg-papel p-6 text-center">
                    <p className="text-sm font-black text-tinta">Todo subido</p>
                    <p className="text-[11px] text-tinta-tenue mt-1">
                        No hay nada esperando. Lo que se registró está en el servidor.
                    </p>
                </div>
            )}

            {bloqueados.length > 0 && (
                <section className="space-y-2">
                    <h3 className="text-sm font-black text-alerta">
                        Necesitan que alguien decida ({bloqueados.length})
                    </h3>
                    <p className="text-[11px] text-tinta-tenue">
                        Se intentaron {LIMITE_INTENTOS} veces y siguen fallando. Insistir no los va a
                        arreglar: hay que mirar qué dice el servidor y decidir.
                    </p>
                    {bloqueados.map(tarjeta)}
                </section>
            )}

            {enEspera.length > 0 && (
                <section className="space-y-2">
                    <h3 className="text-sm font-black text-tinta">
                        Esperando señal ({enEspera.length})
                    </h3>
                    {enEspera.map(tarjeta)}
                </section>
            )}
        </div>
    );
};
