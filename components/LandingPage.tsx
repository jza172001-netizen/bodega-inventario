import React from 'react';
import { InventoryIcon } from './icons/InventoryIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { TruckIcon } from './icons/TruckIcon';
import { PurchaseOrdersIcon } from './icons/PurchaseOrdersIcon';
import { MovementsIcon } from './icons/MovementsIcon';

interface LandingPageProps {
    onGetStarted: () => void;
}

const Feature: React.FC<{ icon: React.ElementType; title: string; description: string }> = ({ icon: Icon, title, description }) => (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-200">
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-4">
            <Icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-blue-100 text-sm leading-relaxed">{description}</p>
    </div>
);

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => (
    <div className="min-h-screen bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-800 flex flex-col">
        <header className="flex items-center justify-between px-8 py-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <InventoryIcon className="w-6 h-6 text-white" />
                </div>
                <span className="text-white font-black text-xl tracking-tighter uppercase">Bodega Pro</span>
            </div>
            <button
                onClick={onGetStarted}
                className="px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl border border-white/30 transition-all text-sm"
            >
                Iniciar sesión
            </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 text-blue-100 text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full border border-white/20 mb-8">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Sistema activo
            </div>

            <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter mb-6 max-w-3xl leading-tight">
                Control total de<br />
                <span className="text-blue-200">tu almacén.</span>
            </h1>

            <p className="text-blue-100 text-lg md:text-xl max-w-xl mb-10 leading-relaxed">
                Inventario en tiempo real, trazabilidad completa de movimientos, préstamos, órdenes de compra y análisis de consumo.
            </p>

            <button
                onClick={onGetStarted}
                className="px-8 py-4 bg-white text-blue-700 font-black text-lg rounded-2xl hover:bg-blue-50 transition-all duration-200 shadow-2xl shadow-blue-900/40 hover:scale-105 active:scale-95"
            >
                Ingresar al sistema →
            </button>
        </main>

        <section className="px-6 pb-16">
            <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Feature
                    icon={CheckCircleIcon}
                    title="Stock en tiempo real"
                    description="Monitorea niveles de inventario al instante. Alertas automáticas cuando el stock está bajo."
                />
                <Feature
                    icon={MovementsIcon}
                    title="Kardex completo"
                    description="Registro de cada entrada, salida, préstamo y merma con trazabilidad por persona y proyecto."
                />
                <Feature
                    icon={PurchaseOrdersIcon}
                    title="Órdenes de compra"
                    description="Crea y da seguimiento a tus pedidos. Importa facturas en PDF, imagen o Excel directamente."
                />
                <Feature
                    icon={TruckIcon}
                    title="Análisis de consumo"
                    description="Visualiza qué materiales se usan más, detecta patrones y optimiza tus compras."
                />
            </div>
        </section>

        <footer className="text-center text-blue-300 text-xs pb-6">
            © {new Date().getFullYear()} Bodega Pro — Sistema de gestión de almacén
        </footer>
    </div>
);
