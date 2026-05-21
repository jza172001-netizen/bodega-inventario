
import React from 'react';

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
}

const Toggle: React.FC<{ label: string; description: string; value: boolean; onToggle: () => void }> = ({ label, description, value, onToggle }) => (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
        <div className="flex-1 pr-4">
            <p className="text-sm font-bold text-gray-800">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
        <button
            onClick={onToggle}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${value ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${value ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ config, onChange, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40" />
        <div
            className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
        >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <span className="text-lg">⚙️</span>
                    <h2 className="text-base font-black text-gray-900 uppercase tracking-tight">Configuración</h2>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <div className="px-6 py-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-3 pb-1">Módulos</p>
                <Toggle
                    label="Módulo de Compras"
                    description="Muestra el tab de órdenes de compra en el Kardex"
                    value={config.showPurchasesModule}
                    onToggle={() => onChange({ ...config, showPurchasesModule: !config.showPurchasesModule })}
                />
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-4 pb-1">Visualización</p>
                <Toggle
                    label="Valores económicos"
                    description="Muestra costos y valores en pesos en proyectos y estadísticas"
                    value={config.showEconomicValues}
                    onToggle={() => onChange({ ...config, showEconomicValues: !config.showEconomicValues })}
                />
            </div>

            <div className="px-6 py-4">
                <button
                    onClick={onClose}
                    className="w-full py-2.5 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-colors"
                >
                    Listo
                </button>
            </div>
        </div>
    </div>
);
