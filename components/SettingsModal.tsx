
import React, { useState } from 'react';
import { UserRole } from '../types';

export interface AppConfig {
    showEconomicValues: boolean;
    showPurchasesModule: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
    showEconomicValues: false,
    showPurchasesModule: false,
};

interface SettingsModalProps {
    config: AppConfig;
    onChange: (config: AppConfig) => void;
    onClose: () => void;
    userRole?: UserRole;
    onResetAllData?: () => void;
    onResetMaterials?: () => void;
}

const Toggle: React.FC<{ label: string; description: string; value: boolean; onToggle: () => void }> = ({ label, description, value, onToggle }) => (
    <div className="flex items-center justify-between py-4 border-b border-papel-borde last:border-0">
        <div className="flex-1 pr-4">
            <p className="text-sm font-bold text-tinta">{label}</p>
            <p className="text-xs text-tinta-tenue mt-0.5">{description}</p>
        </div>
        <button
            onClick={onToggle}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${value ? 'bg-marca' : 'bg-papel-borde'}`}
        >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-papel shadow ring-0 transition duration-200 ease-in-out ${value ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ config, onChange, onClose, userRole, onResetAllData, onResetMaterials }) => {
    const [resetStep, setResetStep] = useState(0);
    const [matResetStep, setMatResetStep] = useState(0);
    const isOwner = userRole !== UserRole.VISITOR;

    const handleResetClick = () => {
        if (resetStep === 0) { setResetStep(1); return; }
        if (resetStep === 1) { setResetStep(2); return; }
        if (resetStep === 2) {
            setResetStep(0);
            onResetAllData?.();
        }
    };

    const resetLabels = [
        '🗑 Restablecer fábrica',
        '⚠️ ¿Seguro? Esto borra TODO',
        '🔴 Confirmar — acción irreversible',
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/40" />
            <div
                className="relative w-full max-w-sm bg-papel rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-papel-borde">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">⚙️</span>
                        <h2 className="text-base font-black text-tinta uppercase tracking-tight">Configuración</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full text-tinta-tenue hover:bg-papel-hondo hover:text-tinta-suave transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                <div className="px-6 py-2">
                    <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest pt-3 pb-1">Módulos</p>
                    <Toggle
                        label="Módulo de Compras"
                        description="Muestra el tab de órdenes de compra en el Kardex"
                        value={config.showPurchasesModule}
                        onToggle={() => onChange({ ...config, showPurchasesModule: !config.showPurchasesModule })}
                    />
                    <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest pt-4 pb-1">Visualización</p>
                    <Toggle
                        label="Valores económicos"
                        description="Muestra costos y valores en pesos en proyectos y estadísticas"
                        value={config.showEconomicValues}
                        onToggle={() => onChange({ ...config, showEconomicValues: !config.showEconomicValues })}
                    />

                    {isOwner && (onResetAllData || onResetMaterials) && (
                        <>
                            <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest pt-5 pb-1">Zona de peligro</p>

                            {onResetMaterials && (
                                <div className="py-3 border-t border-atencion">
                                    <p className="text-xs text-tinta-tenue mb-3">
                                        Borra ítems, movimientos y órdenes de compra — <strong>el personal se conserva</strong>.
                                    </p>
                                    <div className="flex gap-2">
                                        {matResetStep > 0 && (
                                            <button onClick={() => setMatResetStep(0)}
                                                className="px-3 py-2 text-xs font-semibold bg-papel-hondo text-tinta-suave rounded-xl hover:bg-papel-borde transition-colors">
                                                Cancelar
                                            </button>
                                        )}
                                        <button onClick={() => {
                                            if (matResetStep < 2) { setMatResetStep(s => s + 1); return; }
                                            setMatResetStep(0);
                                            onResetMaterials();
                                        }} className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                                            matResetStep === 0
                                                ? 'bg-atencion-suave text-atencion hover:bg-atencion-suave'
                                                : matResetStep === 1
                                                    ? 'bg-atencion text-papel hover:bg-atencion'
                                                    : 'bg-atencion text-papel hover:bg-atencion'
                                        }`}>
                                            {['🗂 Restablecer solo materiales', '⚠️ ¿Seguro? Borra ítems y movimientos', '🔴 Confirmar — acción irreversible'][matResetStep]}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {onResetAllData && (
                                <div className="py-3 border-t border-alerta">
                                    <p className="text-xs text-tinta-tenue mb-3">
                                        Borra <strong>todos</strong> los ítems, movimientos, trabajadores y proyectos — tanto en la app como en la base de datos. Esta acción es irreversible.
                                    </p>
                                    <div className="flex gap-2">
                                        {resetStep > 0 && (
                                            <button onClick={() => setResetStep(0)}
                                                className="px-3 py-2 text-xs font-semibold bg-papel-hondo text-tinta-suave rounded-xl hover:bg-papel-borde transition-colors">
                                                Cancelar
                                            </button>
                                        )}
                                        <button onClick={handleResetClick}
                                            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                                                resetStep === 0
                                                    ? 'bg-alerta-suave text-alerta hover:bg-alerta-suave'
                                                    : resetStep === 1
                                                        ? 'bg-alerta text-papel hover:bg-alerta'
                                                        : 'bg-alerta text-papel hover:bg-alerta'
                                            }`}>
                                            {resetLabels[resetStep]}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-6 py-4">
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 bg-marca text-tinta font-black text-xs uppercase tracking-widest rounded-xl hover:bg-marca-fuerte transition-colors"
                    >
                        Listo
                    </button>
                </div>
            </div>
        </div>
    );
};
