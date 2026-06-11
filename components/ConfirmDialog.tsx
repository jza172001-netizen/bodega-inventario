import React from 'react';

interface ConfirmDialogProps {
    title?: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onClose: () => void;
}

// Reemplazo de window.confirm(): funciona en WebViews móviles y Safari iOS.
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    title = 'Confirmar',
    message,
    confirmLabel = 'Sí, continuar',
    onConfirm,
    onClose,
}) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
        <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
        >
            <div className="bg-amber-500 px-5 py-4 flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <p className="text-white font-black text-sm">{title}</p>
            </div>
            <div className="p-5 space-y-4">
                <p className="text-sm text-gray-700 text-center font-medium whitespace-pre-line">{message}</p>
                <div className="flex gap-2 pt-1">
                    <button type="button" onClick={onClose}
                        className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold rounded-xl transition-all">
                        Cancelar
                    </button>
                    <button type="button" onClick={() => { onConfirm(); onClose(); }}
                        className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-black rounded-xl transition-all">
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    </div>
);
