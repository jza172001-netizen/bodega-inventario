
import React from 'react';
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
    /** Abre la gestión de accesos. Solo el administrador la ve. */
    onOpenUserManagement?: () => void;
}

/**
 * Acá vivía la «Zona de peligro»: dos botones que borraban la bodega entera.
 *
 * No eran una lápida como el resto de los borrados —eran un DELETE de verdad
 * contra Supabase, sin vuelta atrás— y se disparaban con tres toques al MISMO
 * botón. Al dueño ni siquiera le pedían la clave: tres toques seguidos en el
 * mismo punto de la pantalla y no quedaba nada. El bodeguero también los veía.
 *
 * Nunca se dispararon (cero renglones de reset en la bitácora), así que no hubo
 * daño; esto es cerrar la puerta antes de entregarle la app a alguien más.
 *
 * Si algún día de verdad hay que empezar de cero, se hace por fuera y queda su
 * renglón en la trazabilidad, como toda operación sobre los datos de verdad.
 */

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

export const SettingsModal: React.FC<SettingsModalProps> = ({ config, onChange, onClose, userRole, onOpenUserManagement }) => {
    const isOwner = userRole !== UserRole.VISITOR;

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

                    {/* Gestión de accesos. El modal ya existía pero no tenía por
                        dónde abrirse: la prop del encabezado estaba declarada y sin
                        usar, así que crear un usuario era imposible desde la app. Va
                        acá, en Configuración, y solo para el administrador. */}
                    {userRole === UserRole.OWNER && onOpenUserManagement && (
                        <>
                            <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest pt-5 pb-1">Personas que entran</p>
                            <button
                                onClick={onOpenUserManagement}
                                className="w-full flex items-center justify-between gap-3 py-3 border-t border-papel-borde text-left"
                            >
                                <span className="min-w-0">
                                    <span className="block text-sm font-bold text-tinta">Accesos a la app</span>
                                    <span className="block text-xs text-tinta-tenue">
                                        Crear o quitar accesos. Cada quien pone su propia contraseña la
                                        primera vez que entra.
                                    </span>
                                </span>
                                <span className="flex-shrink-0 text-xs font-black text-marca-oscuro">Abrir →</span>
                            </button>
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
