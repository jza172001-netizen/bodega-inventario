import React, { useEffect, useState, useCallback } from 'react';
import { UserRole } from '../types';
import * as db from '../services/supabaseService';
import type { EnLaPapelera, TablaPapelera } from '../services/supabaseService';

interface Props {
    userRole: UserRole;
    /** Devolver algo tiene que rehacerlo también en la pantalla, no solo en la base. */
    onRestaurado: (fila: EnLaPapelera) => void;
    onAuditLog: (action: string, description: string) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

/** Cómo se llama cada cosa en la pantalla, y en qué orden se muestran. */
const GRUPOS: { tabla: TablaPapelera; titulo: string; emoji: string }[] = [
    { tabla: 'items',           titulo: 'Ítems',            emoji: '📦' },
    { tabla: 'movements',       titulo: 'Movimientos',      emoji: '🔄' },
    { tabla: 'personnel',       titulo: 'Trabajadores',     emoji: '👷' },
    { tabla: 'projects',        titulo: 'Proyectos',        emoji: '🏗' },
    { tabla: 'order_list',      titulo: 'Lista de pedidos', emoji: '📝' },
    { tabla: 'app_users',       titulo: 'Accesos',          emoji: '🔑' },
    { tabla: 'purchase_orders', titulo: 'Órdenes de compra', emoji: '🧾' },
];

const cuandoFue = (d: Date): string => {
    const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'ayer';
    return `hace ${dias} días`;
};

/**
 * La papelera.
 *
 * Borrar en esta app nunca quitó la fila: le pone una lápida (`deleted_at`) y la
 * esconde. El dato siempre estuvo ahí — lo que no había era manera de verlo ni
 * de devolverlo sin entrar a la base a mano.
 *
 * No lleva botón de vaciar. Vaciar sería el único borrado de verdad que
 * quedaría en la app, y la regla de la casa es que no se pierde nada: si algún
 * día sobra espacio, se limpia por fuera y queda su renglón en la trazabilidad.
 */
export const PapeleraView: React.FC<Props> = ({ userRole, onRestaurado, onAuditLog, onBehaviorLog }) => {
    const [filas, setFilas] = useState<EnLaPapelera[] | null>(null);
    const [error, setError] = useState('');
    const [trabajando, setTrabajando] = useState<string | null>(null);
    const soloMirar = userRole === UserRole.VISITOR;

    const cargar = useCallback(() => {
        setError('');
        db.fetchPapelera()
            .then(setFilas)
            .catch(e => { console.error('[Papelera]', e); setFilas([]); setError('No se pudo leer la papelera. Revisá la conexión.'); });
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const devolver = async (f: EnLaPapelera) => {
        setTrabajando(f.id);
        try {
            await db.restaurar(f.tabla, f.id);
            onAuditLog('RESTAURADO', `Devolvió de la papelera: "${f.titulo}"${f.detalle ? ` (${f.detalle})` : ''}`);
            onBehaviorLog?.('ACTION', `Devolvió de la papelera: ${f.titulo}`);
            onRestaurado(f);
            setFilas(prev => (prev ?? []).filter(x => !(x.tabla === f.tabla && x.id === f.id)));
        } catch (e) {
            console.error('[Papelera] devolver', e);
            setError(`No se pudo devolver "${f.titulo}". Intentá otra vez.`);
        } finally {
            setTrabajando(null);
        }
    };

    if (filas === null) {
        return <p className="text-xs text-tinta-tenue p-4">Buscando lo que se ha borrado…</p>;
    }

    return (
        <div className="space-y-4 max-w-2xl mx-auto">
            <div>
                <h2 className="text-lg font-black text-tinta">🗑 Papelera</h2>
                <p className="text-xs text-tinta-tenue mt-0.5">
                    Nada de lo que se borra en la app se pierde: queda acá y se puede devolver.
                </p>
            </div>

            {error && (
                <div className="rounded-xl border border-alerta bg-alerta-suave px-3 py-2">
                    <p className="text-xs font-bold text-alerta">{error}</p>
                    <button onClick={cargar} className="text-[11px] font-black text-alerta underline mt-1">Reintentar</button>
                </div>
            )}

            {filas.length === 0 && !error && (
                <div className="rounded-2xl border border-papel-borde bg-papel p-6 text-center">
                    <p className="text-3xl">🗑</p>
                    <p className="text-sm font-bold text-tinta mt-2">La papelera está vacía</p>
                    <p className="text-xs text-tinta-tenue mt-1">Acá va a aparecer todo lo que se borre, con quién lo borró y cuándo.</p>
                </div>
            )}

            {GRUPOS.map(g => {
                const suyas = filas.filter(f => f.tabla === g.tabla);
                if (suyas.length === 0) return null;
                return (
                    <div key={g.tabla} className="space-y-1.5">
                        <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest">
                            {g.emoji} {g.titulo} <span className="text-tinta-tenue/70">({suyas.length})</span>
                        </p>
                        {suyas.map(f => (
                            <div key={`${f.tabla}-${f.id}`}
                                className="rounded-xl border border-papel-borde bg-papel p-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-tinta truncate">{f.titulo}</p>
                                    {f.detalle && <p className="text-[11px] text-tinta-suave truncate">{f.detalle}</p>}
                                    <p className="text-[10px] text-tinta-tenue mt-0.5">
                                        Borrado {cuandoFue(f.borradoEl)} ·{' '}
                                        {f.borradoPor
                                            ? `por ${f.borradoPor}`
                                            : 'no quedó registrado quién'}
                                    </p>
                                </div>
                                {/* Verde lleno con letra blanca. Antes iba `bg-bien-suave`
                                    —un verde casi blanco— con `text-papel` encima, y el botón
                                    salía en blanco sobre blanco: el mismo error del selector de
                                    fechas que Juli reportó como «me aparece en blanco». */}
                                {!soloMirar && (
                                    <button
                                        onClick={() => devolver(f)}
                                        disabled={trabajando === f.id}
                                        className="flex-shrink-0 px-3 py-2 text-xs font-black bg-bien hover:bg-bien text-papel rounded-xl transition-all disabled:opacity-50">
                                        {trabajando === f.id ? '…' : '↩ Devolver'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                );
            })}

            {filas.length > 0 && (
                <p className="text-[10px] text-tinta-tenue px-1">
                    Lo borrado antes de hoy no dice quién lo hizo: ese dato no se guardaba.
                </p>
            )}
        </div>
    );
};
