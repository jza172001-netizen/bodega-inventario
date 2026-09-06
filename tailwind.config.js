/**
 * El sistema de color de la bodega.
 *
 * Antes no había ninguno: 2.552 clases de color escritas a mano en 187
 * variantes por todo el código, y el azul genérico de Tailwind como color
 * principal en una empresa cuyo logo es amarillo.
 *
 * El amarillo salió del propio logo (#f5be09, el color de 1.394 de sus
 * píxeles). Y de ahí sale la única regla que no se rompe:
 *
 *   el amarillo va de FONDO, con tinta encima — nunca de texto sobre blanco.
 *
 * Como texto sobre blanco da 1.71 : 1, que es invisible. De fondo con tinta
 * encima da 10.15 : 1. Para cuando de verdad hace falta texto de marca está
 * `marca-oscuro`, que es el mismo tono bajado hasta que se lee.
 *
 * Ojo con los dos tonos más claros: están calculados contra el fondo MÁS OSCURO
 * de la paleta, no contra blanco. Afinados contra blanco daban 4.5 justos y
 * caían a 4.2 en cuanto se ponían sobre `papel-hondo` o `marca-suave`, que es
 * donde más se usan.
 */
export default {
    content: ['./index.html', './index.tsx', './App.tsx', './components/**/*.{ts,tsx}', './utils/**/*.ts'],
    theme: {
        extend: {
            colors: {
                marca:            '#f5be09',   // fondo de lo que se toca
                'marca-fuerte':   '#d9a707',   // el mismo, presionado
                'marca-oscuro':   '#876600',   // texto de marca — 4.61:1 en el PEOR fondo
                'marca-suave':    '#fef9e6',   // fondo tenue de lo destacado
                'marca-borde':    '#f7dc8a',

                tinta:            '#1a1a1a',   // 17.40:1
                'tinta-suave':    '#4a4a4a',   // 8.86:1
                'tinta-tenue':    '#6c6c6c',   // 4.53:1 en el peor fondo — el más claro que aún se lee

                papel:            '#ffffff',
                'papel-hondo':    '#f6f6f4',
                'papel-borde':    '#e6e6e2',

                alerta:           '#c81e1e',   // agotado, borrar
                'alerta-suave':   '#fdeaea',
                atencion:         '#a35a00',   // bajo, préstamos abiertos
                'atencion-suave': '#fdf3e6',
                bien:             '#0f7a34',   // OK, devuelto
                'bien-suave':     '#eaf6ee',
            },
        },
    },
    plugins: [],
};
