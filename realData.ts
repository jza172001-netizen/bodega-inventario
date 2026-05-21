import { Item, Movement, Personnel, Project, AppUser, InventoryType, MovementType, UserRole } from './types';

const d = (day: number, month: number, year = 2026): Date =>
    new Date(year, month - 1, day, 10, 0, 0);

let _mid = 1;
const mid = () => `rm-${String(_mid++).padStart(4, '0')}`;

// ── USERS ────────────────────────────────────────────────────────────────────
export const realUsers: AppUser[] = [
    { id: 'user-master', username: 'bodeguero', password: '00', role: UserRole.OWNER, name: 'Bodeguero' },
    { id: 'user-visit', username: 'visitante', password: '00', role: UserRole.EMPLOYEE, name: 'Visitante' },
];

// ── PERSONAL ─────────────────────────────────────────────────────────────────
export const realPersonnel: Personnel[] = [
    { id: 'rp-abel', name: 'Abel' },
    { id: 'rp-alex', name: 'Alex' },
    { id: 'rp-anderson', name: 'Anderson' },
    { id: 'rp-adrian', name: 'Adrián Echeverry' },
    { id: 'rp-albeiro', name: 'Albeiro' },
    { id: 'rp-andres', name: 'Andrés Hernández' },
    { id: 'rp-alex-ferreiro', name: 'Alexander Ferreiro' },
    { id: 'rp-alex-contreras', name: 'Alexander Contreras' },
    { id: 'rp-brian', name: 'Brian Sánchez' },
    { id: 'rp-carlos-garcia', name: 'Carlos García' },
    { id: 'rp-carlos-torrealba', name: 'Carlos Torrealba' },
    { id: 'rp-duvan', name: 'Duván' },
    { id: 'rp-dani', name: 'Dani' },
    { id: 'rp-evelio', name: 'Evelio' },
    { id: 'rp-ferney', name: 'Ferney Giraldo' },
    { id: 'rp-hugo', name: 'Hugo' },
    { id: 'rp-hector', name: 'Héctor' },
    { id: 'rp-juan-echeverry', name: 'Juan Echeverry' },
    { id: 'rp-juan-salazar', name: 'Juan Salazar' },
    { id: 'rp-jorman', name: 'Jorman' },
    { id: 'rp-jesus', name: 'Jesús Vázquez' },
    { id: 'rp-sebastian', name: 'Sebastián' },
    { id: 'rp-jorge', name: 'Jorge / Germán' },
    { id: 'rp-ricardo', name: 'Ricardo' },
    { id: 'rp-raul', name: 'Raúl' },
    { id: 'rp-william', name: 'William' },
    { id: 'rp-haider', name: 'Haider' },
    { id: 'rp-mello', name: 'Mello' },
    { id: 'rp-yesid', name: 'Yesid' },
];

// ── ITEMS ────────────────────────────────────────────────────────────────────
export const realItems: Item[] = [
    // HERRAMIENTAS MANUALES
    { id: 'ht-barra', name: 'Barra', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-pala', name: 'Pala', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-pala-coca', name: 'Pala coca', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-palin', name: 'Palín', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-cizalla', name: 'Cizalla', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-almadana', name: 'Almádana', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-pica', name: 'Pica', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-banera-nivel', name: 'Bañera de nivel', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-codal', name: 'Codal', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-plomada-punto', name: 'Plomada de punto', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-bichiroqui', name: 'Bichiroqui', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-destornillador-estrella', name: 'Destornillador estrella', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-destornillador-pala', name: 'Destornillador de pala', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-falustre', name: 'Falustre', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-pistola-calafateo', name: 'Pistola de calafateo', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-espatula', name: 'Espátula', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-espatula-pequena', name: 'Espátula pequeña', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-espatalon', name: 'Espátulón', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-martillo', name: 'Martillo', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-reflectores', name: 'Reflectores', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-serrucho', name: 'Serrucho', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-serrucho-drywall', name: 'Serrucho drywall', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-escuadra', name: 'Escuadra', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-hachuela', name: 'Hachuela', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-alicate', name: 'Alicate', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-cincel', name: 'Cincel', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-broca-conica', name: 'Broca cónica grande', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-cortatubo', name: 'Cortatubo', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-chapulin', name: 'Chapulín', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-segueta', name: 'Segueta', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-cepillo-alambre', name: 'Cepillo de alambre', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-plomada', name: 'Plomada', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-bomba', name: 'Bomba', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-zaranda', name: 'Zaranda', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-tacos', name: 'Tacos pequeños', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-simbra', name: 'Simbra', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-tijeras-lamina', name: 'Tijeras de lámina', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-prensa', name: 'Prensa', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-escoba', name: 'Escoba', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-diferencial', name: 'Diferencial', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-llana-lisa', name: 'Llana lisa', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-llana-dentada', name: 'Llana dentada', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-paleta', name: 'Paleta', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-paleta-plastica', name: 'Paleta plástica', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-palustre', name: 'Palustre', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-azadon', name: 'Azadón', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-machete', name: 'Machete', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-nivel', name: 'Nivel', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-nivel-mano', name: 'Nivel de mano', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-manguera-nivel', name: 'Manguera de nivel', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-llave12', name: 'Llave 12', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-llave14', name: 'Llave 14', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-llaves-hex', name: 'Llaves hexagonales', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-trapera', name: 'Trapera', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-metro', name: 'Metro', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-rastrillo', name: 'Rastrillo de cemento', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-liansa', name: 'Liansa', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-remachadora', name: 'Remachadora', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-mezclador-taladro', name: 'Mezclador para taladro', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-copa-grande', name: 'Copa grande', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-chipote', name: 'Chipote', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-rache', name: 'Rache', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-equipo-topo', name: 'Equipo topografía', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-llana', name: 'Llana', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'ht-cascos-obra', name: 'Cascos de obra', category: 'Herramienta Manual', subCategory: 'Herramienta Manual', inventoryType: InventoryType.HAND_TOOL, quantity: 1, minStock: 0, unit: 'und' },

    // HERRAMIENTAS ELÉCTRICAS
    { id: 'et-pulidora-pequena', name: 'Pulidora pequeña', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 4, minStock: 0, unit: 'und' },
    { id: 'et-pulidora-grande', name: 'Pulidora grande', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 3, minStock: 0, unit: 'und' },
    { id: 'et-radial', name: 'Radial', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 3, minStock: 0, unit: 'und' },
    { id: 'et-taladro-inalambrico', name: 'Taladro inalámbrico', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 2, minStock: 0, unit: 'und' },
    { id: 'et-taladro-alambrico', name: 'Taladro alámbrico', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 0, minStock: 0, unit: 'und' },
    { id: 'et-taladro-percutor', name: 'Taladro percutor', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 0, minStock: 0, unit: 'und' },
    { id: 'et-taladro-demoledor', name: 'Taladro demoledor', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 0, minStock: 0, unit: 'und' },
    { id: 'et-lijadora', name: 'Lijadora', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 6, minStock: 0, unit: 'und' },
    { id: 'et-mezcladora', name: 'Mezcladora eléctrica', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'et-vibrador', name: 'Vibrador de concreto', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'et-motor', name: 'Motor', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 3, minStock: 0, unit: 'und' },
    { id: 'et-tronzadora', name: 'Tronzadora', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 2, minStock: 0, unit: 'und' },
    { id: 'et-colichadora', name: 'Colichadora', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'et-pesa', name: 'Pesa eléctrica', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'et-gramera', name: 'Gramera eléctrica', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'et-plomada-laser', name: 'Plomada láser', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'et-nivel-laser', name: 'Nivel láser', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 0, minStock: 0, unit: 'und' },
    { id: 'et-hidrolavadora', name: 'Hidrolavadora', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'et-canguro', name: 'Canguro / Rana', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'et-soldador-grande', name: 'Soldador grande', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 1, minStock: 0, unit: 'und' },
    { id: 'et-soldador-pequeno', name: 'Soldador pequeño', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 2, minStock: 0, unit: 'und' },
    { id: 'et-compresor', name: 'Compresor', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 2, minStock: 0, unit: 'und' },
    { id: 'et-extension', name: 'Extensión eléctrica', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 5, minStock: 0, unit: 'und' },
    { id: 'et-cortadora-enchape', name: 'Cortadora de enchape', category: 'Herramienta Eléctrica', subCategory: 'Herramienta Eléctrica', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 0, minStock: 0, unit: 'und' },

    // EPP
    { id: 'ppe-guantes-negros', name: 'Guantes negros', category: 'EPP', subCategory: 'Protección Personal', inventoryType: InventoryType.PPE, quantity: 20, minStock: 10, unit: 'par' },
    { id: 'ppe-guantes-naranjas', name: 'Guantes naranjas', category: 'EPP', subCategory: 'Protección Personal', inventoryType: InventoryType.PPE, quantity: 20, minStock: 10, unit: 'par' },
    { id: 'ppe-guantes-caucho', name: 'Guantes de caucho', category: 'EPP', subCategory: 'Protección Personal', inventoryType: InventoryType.PPE, quantity: 10, minStock: 5, unit: 'par' },
    { id: 'ppe-guantes-azules', name: 'Guantes azules de goma', category: 'EPP', subCategory: 'Protección Personal', inventoryType: InventoryType.PPE, quantity: 10, minStock: 5, unit: 'par' },
    { id: 'ppe-gafas-negras', name: 'Gafas negras', category: 'EPP', subCategory: 'Protección Personal', inventoryType: InventoryType.PPE, quantity: 15, minStock: 5, unit: 'und' },
    { id: 'ppe-gafas-seguridad', name: 'Gafas de seguridad', category: 'EPP', subCategory: 'Protección Personal', inventoryType: InventoryType.PPE, quantity: 10, minStock: 5, unit: 'und' },
    { id: 'ppe-botas', name: 'Botas de goma', category: 'EPP', subCategory: 'Protección Personal', inventoryType: InventoryType.PPE, quantity: 5, minStock: 3, unit: 'par' },
    { id: 'ppe-impermeable', name: 'Impermeable', category: 'EPP', subCategory: 'Protección Personal', inventoryType: InventoryType.PPE, quantity: 5, minStock: 3, unit: 'und' },
    { id: 'ppe-tapaoidos', name: 'Tapaoídos / Filtros', category: 'EPP', subCategory: 'Protección Personal', inventoryType: InventoryType.PPE, quantity: 20, minStock: 10, unit: 'und' },
    { id: 'ppe-cascos', name: 'Cascos de seguridad', category: 'EPP', subCategory: 'Protección Personal', inventoryType: InventoryType.PPE, quantity: 15, minStock: 10, unit: 'und' },

    // CONSUMIBLES
    { id: 'su-tornillos-2', name: 'Tornillos 2"', category: 'Consumible', subCategory: 'Fijaciones', inventoryType: InventoryType.SINGLE_USE, quantity: 500, minStock: 200, unit: 'und' },
    { id: 'su-tornillos-1-5', name: 'Tornillos 1½"', category: 'Consumible', subCategory: 'Fijaciones', inventoryType: InventoryType.SINGLE_USE, quantity: 500, minStock: 200, unit: 'und' },
    { id: 'su-tornillos-0-5', name: 'Tornillos ½"', category: 'Consumible', subCategory: 'Fijaciones', inventoryType: InventoryType.SINGLE_USE, quantity: 500, minStock: 200, unit: 'und' },
    { id: 'su-clavos-acero-3', name: 'Clavos de acero 3"', category: 'Consumible', subCategory: 'Fijaciones', inventoryType: InventoryType.SINGLE_USE, quantity: 200, minStock: 100, unit: 'und' },
    { id: 'su-clavos-hierro-2', name: 'Clavos de hierro 2"', category: 'Consumible', subCategory: 'Fijaciones', inventoryType: InventoryType.SINGLE_USE, quantity: 200, minStock: 100, unit: 'und' },
    { id: 'su-clavos-acero', name: 'Clavos de acero', category: 'Consumible', subCategory: 'Fijaciones', inventoryType: InventoryType.SINGLE_USE, quantity: 300, minStock: 100, unit: 'und' },
    { id: 'su-lapiz', name: 'Lápiz', category: 'Consumible', subCategory: 'Varios', inventoryType: InventoryType.SINGLE_USE, quantity: 20, minStock: 10, unit: 'und' },
    { id: 'su-estopa', name: 'Estopa', category: 'Consumible', subCategory: 'Limpieza', inventoryType: InventoryType.SINGLE_USE, quantity: 10, minStock: 5, unit: 'und' },
    { id: 'su-brocha-3', name: 'Brocha 3"', category: 'Consumible', subCategory: 'Pintura', inventoryType: InventoryType.SINGLE_USE, quantity: 10, minStock: 5, unit: 'und' },
    { id: 'su-galon-3en1', name: 'Galón 3 en 1', category: 'Consumible', subCategory: 'Pintura', inventoryType: InventoryType.SINGLE_USE, quantity: 5, minStock: 3, unit: 'galón' },
    { id: 'su-gasolina', name: 'Gasolina', category: 'Consumible', subCategory: 'Combustible', inventoryType: InventoryType.SINGLE_USE, quantity: 10, minStock: 5, unit: 'litro' },
    { id: 'su-trapo', name: 'Trapo', category: 'Consumible', subCategory: 'Limpieza', inventoryType: InventoryType.SINGLE_USE, quantity: 20, minStock: 10, unit: 'und' },
    { id: 'su-lija-2000', name: 'Lija #2000', category: 'Consumible', subCategory: 'Abrasivos', inventoryType: InventoryType.SINGLE_USE, quantity: 20, minStock: 10, unit: 'und' },
    { id: 'su-lija-1500', name: 'Lija #1500', category: 'Consumible', subCategory: 'Abrasivos', inventoryType: InventoryType.SINGLE_USE, quantity: 20, minStock: 10, unit: 'und' },
    { id: 'su-cinta-negra', name: 'Cinta negra', category: 'Consumible', subCategory: 'Eléctrico', inventoryType: InventoryType.SINGLE_USE, quantity: 10, minStock: 5, unit: 'und' },
    { id: 'su-lampara-12w', name: 'Lámparas 12W', category: 'Consumible', subCategory: 'Eléctrico', inventoryType: InventoryType.SINGLE_USE, quantity: 20, minStock: 10, unit: 'und' },
    { id: 'su-barniz', name: 'Barniz', category: 'Consumible', subCategory: 'Pintura', inventoryType: InventoryType.SINGLE_USE, quantity: 5, minStock: 3, unit: 'und' },
    { id: 'su-acido', name: 'Ácido', category: 'Consumible', subCategory: 'Químicos', inventoryType: InventoryType.SINGLE_USE, quantity: 5, minStock: 3, unit: 'und' },
    { id: 'su-sifon', name: 'Sifón de tubería', category: 'Consumible', subCategory: 'Plomería', inventoryType: InventoryType.SINGLE_USE, quantity: 5, minStock: 3, unit: 'und' },
    { id: 'su-semicodo', name: 'Semicodos 3"', category: 'Consumible', subCategory: 'Plomería', inventoryType: InventoryType.SINGLE_USE, quantity: 10, minStock: 5, unit: 'und' },
    { id: 'su-tubo', name: 'Tubo', category: 'Consumible', subCategory: 'Plomería', inventoryType: InventoryType.SINGLE_USE, quantity: 10, minStock: 5, unit: 'und' },
    { id: 'su-silicona', name: 'Silicona epóxica', category: 'Consumible', subCategory: 'Químicos', inventoryType: InventoryType.SINGLE_USE, quantity: 5, minStock: 3, unit: 'und' },
];

// ── MOVIMIENTOS ──────────────────────────────────────────────────────────────
const loan = (itemId: string, personId: string, qty: number, date: Date): Movement => ({
    id: mid(), itemId, type: MovementType.CHECK_OUT, quantity: qty, timestamp: date,
    personnelId: personId, isLoan: true, isReturned: false,
});
const consume = (itemId: string, personId: string, qty: number, date: Date): Movement => ({
    id: mid(), itemId, type: MovementType.CHECK_OUT, quantity: qty, timestamp: date,
    personnelId: personId, isLoan: false, isReturned: false,
});

export const realMovements: Movement[] = [
    // ── HERRAMIENTAS MANUALES – Alex ──
    loan('ht-barra', 'rp-alex', 1, d(14,1)), loan('ht-pala', 'rp-alex', 1, d(15,1)),
    loan('ht-pala', 'rp-alex', 1, d(16,1)), loan('ht-pala', 'rp-alex', 1, d(16,1)),
    loan('ht-barra', 'rp-alex', 1, d(16,1)), loan('ht-barra', 'rp-alex', 1, d(19,1)),
    loan('ht-pala', 'rp-alex', 1, d(19,1)), loan('ht-pala', 'rp-alex', 1, d(19,1)),
    loan('ht-cizalla', 'rp-alex', 1, d(19,1)), loan('ht-almadana', 'rp-alex', 1, d(20,1)),
    loan('ht-pica', 'rp-alex', 1, d(20,1)), loan('ht-pica', 'rp-alex', 1, d(20,1)),
    loan('ht-pala', 'rp-alex', 1, d(21,1)), loan('ht-pala', 'rp-alex', 1, d(21,1)),
    loan('ht-cizalla', 'rp-alex', 1, d(21,1)), loan('ht-banera-nivel', 'rp-alex', 1, d(22,1)),
    loan('ht-codal', 'rp-alex', 1, d(22,1)), loan('ht-barra', 'rp-alex', 1, d(27,1)),
    loan('ht-cascos-obra', 'rp-alex', 14, d(27,1)), loan('ht-plomada-punto', 'rp-alex', 1, d(27,1)),
    loan('ht-pala', 'rp-alex', 1, d(27,1)), loan('ht-pala-coca', 'rp-alex', 1, d(27,1)),
    loan('ht-pala', 'rp-alex', 1, d(2,3)), loan('ht-pala', 'rp-alex', 1, d(2,3)),
    loan('ht-bichiroqui', 'rp-alex', 5, d(20,3)), loan('ht-destornillador-estrella', 'rp-alex', 1, d(30,3)),
    loan('ht-pica', 'rp-alex', 1, d(14,4)), loan('ht-palin', 'rp-alex', 1, d(16,4)),
    loan('ht-codal', 'rp-alex', 1, d(21,4)), loan('ht-falustre', 'rp-alex', 1, d(23,4)),
    loan('ht-bichiroqui', 'rp-alex', 1, d(24,4)), loan('ht-pistola-calafateo', 'rp-alex', 1, d(24,4)),
    loan('ht-espatula', 'rp-alex', 1, d(24,4)), loan('ht-martillo', 'rp-alex', 1, d(27,4)),
    loan('ht-reflectores', 'rp-alex', 1, d(28,4)), loan('ht-almadana', 'rp-alex', 1, d(7,5)),

    // ── HERRAMIENTAS MANUALES – Anderson ──
    loan('ht-serrucho', 'rp-anderson', 1, d(20,1)), loan('ht-escuadra', 'rp-anderson', 1, d(22,1)),
    loan('ht-pala', 'rp-anderson', 1, d(24,4)), loan('ht-hachuela', 'rp-anderson', 1, d(24,4)),

    // ── HERRAMIENTAS MANUALES – Albeiro ──
    loan('ht-pala-coca', 'rp-albeiro', 1, d(5,2)), loan('ht-barra', 'rp-albeiro', 1, d(12,2)),
    loan('ht-machete', 'rp-albeiro', 1, d(14,3)), loan('ht-machete', 'rp-albeiro', 1, d(14,3)),
    loan('ht-machete', 'rp-albeiro', 1, d(18,3)), loan('ht-llave12', 'rp-albeiro', 1, d(6,4)),
    loan('ht-llave14', 'rp-albeiro', 1, d(6,4)), loan('ht-pala-coca', 'rp-albeiro', 1, d(20,4)),

    // ── HERRAMIENTAS MANUALES – Andrés Hernández ──
    loan('ht-destornillador-pala', 'rp-andres', 1, d(21,1)), loan('ht-alicate', 'rp-andres', 1, d(21,1)),
    loan('ht-cincel', 'rp-andres', 1, d(21,1)), loan('ht-cincel', 'rp-andres', 1, d(21,1)),
    loan('ht-almadana', 'rp-andres', 1, d(21,1)), loan('ht-broca-conica', 'rp-andres', 1, d(26,1)),
    loan('ht-cortatubo', 'rp-andres', 1, d(28,1)), loan('ht-cortatubo', 'rp-andres', 1, d(14,2)),
    loan('ht-almadana', 'rp-andres', 1, d(18,2)), loan('ht-cincel', 'rp-andres', 1, d(18,2)),

    // ── Alexander Ferreiro ──
    loan('ht-escuadra', 'rp-alex-ferreiro', 1, d(5,3)),

    // ── Alexander Contreras ──
    loan('ht-tacos', 'rp-alex-contreras', 5, d(14,1)), loan('ht-zaranda', 'rp-alex-contreras', 1, d(14,1)),

    // ── HERRAMIENTAS MANUALES – Carlos García ──
    loan('ht-bichiroqui', 'rp-carlos-garcia', 1, d(27,1)), loan('ht-diferencial', 'rp-carlos-garcia', 1, d(22,1)),
    loan('ht-barra', 'rp-carlos-garcia', 1, d(28,1)), loan('ht-espatula', 'rp-carlos-garcia', 1, d(30,1)),
    loan('ht-llana-lisa', 'rp-carlos-garcia', 1, d(31,1)), loan('ht-pala', 'rp-carlos-garcia', 1, d(2,2)),
    loan('ht-palin', 'rp-carlos-garcia', 1, d(2,2)), loan('ht-azadon', 'rp-carlos-garcia', 1, d(6,2)),
    loan('ht-palustre', 'rp-carlos-garcia', 1, d(13,3)), loan('ht-martillo', 'rp-carlos-garcia', 1, d(19,3)),
    loan('ht-martillo', 'rp-carlos-garcia', 1, d(6,4)), loan('ht-nivel-mano', 'rp-carlos-garcia', 1, d(7,4)),
    loan('ht-paleta', 'rp-carlos-garcia', 1, d(9,4)), loan('ht-paleta', 'rp-carlos-garcia', 1, d(9,4)),
    loan('ht-llana-dentada', 'rp-carlos-garcia', 1, d(15,4)), loan('ht-paleta-plastica', 'rp-carlos-garcia', 1, d(15,4)),
    loan('ht-pica', 'rp-carlos-garcia', 1, d(24,4)), loan('ht-pica', 'rp-carlos-garcia', 1, d(24,4)),
    loan('ht-palin', 'rp-carlos-garcia', 1, d(24,4)), loan('ht-pala-coca', 'rp-carlos-garcia', 1, d(24,4)),
    loan('ht-bichiroqui', 'rp-carlos-garcia', 1, d(25,4)),

    // ── Duván ──
    loan('ht-espatula', 'rp-duvan', 1, d(25,4)),

    // ── Dani ──
    loan('ht-llana-lisa', 'rp-dani', 1, d(20,4)), loan('ht-rache', 'rp-dani', 1, d(24,4)),

    // ── HERRAMIENTAS MANUALES – Ferney Giraldo ──
    loan('ht-remachadora', 'rp-ferney', 1, d(21,1)), loan('ht-simbra', 'rp-ferney', 1, d(2,3)),
    loan('ht-tijeras-lamina', 'rp-ferney', 1, d(4,3)), loan('ht-tijeras-lamina', 'rp-ferney', 1, d(4,3)),
    loan('ht-prensa', 'rp-ferney', 1, d(9,3)), loan('ht-escoba', 'rp-ferney', 1, d(13,3)),
    loan('ht-palin', 'rp-ferney', 1, d(16,3)), loan('ht-tijeras-lamina', 'rp-ferney', 1, d(13,4)),
    loan('ht-machete', 'rp-ferney', 1, d(21,4)), loan('ht-machete', 'rp-ferney', 1, d(21,4)),
    loan('ht-espatula', 'rp-ferney', 1, d(24,4)), loan('ht-pistola-calafateo', 'rp-ferney', 1, d(24,4)),
    loan('ht-chipote', 'rp-ferney', 1, d(30,4)), loan('ht-chipote', 'rp-ferney', 1, d(30,4)),
    loan('ht-mezclador-taladro', 'rp-ferney', 1, d(4,5)), loan('ht-llana-lisa', 'rp-ferney', 1, d(6,5)),
    loan('ht-copa-grande', 'rp-ferney', 1, d(9,5)),

    // ── HERRAMIENTAS MANUALES – Héctor ──
    loan('ht-cincel', 'rp-hector', 1, d(26,1)), loan('ht-cincel', 'rp-hector', 1, d(26,1)),
    loan('ht-almadana', 'rp-hector', 1, d(27,1)), loan('ht-nivel', 'rp-hector', 1, d(27,1)),
    loan('ht-falustre', 'rp-hector', 1, d(27,1)), loan('ht-escuadra', 'rp-hector', 1, d(27,1)),
    loan('ht-bichiroqui', 'rp-hector', 1, d(27,1)), loan('ht-cepillo-alambre', 'rp-hector', 1, d(27,1)),
    loan('ht-alicate', 'rp-hector', 1, d(27,1)), loan('ht-chapulin', 'rp-hector', 1, d(27,1)),
    loan('ht-segueta', 'rp-hector', 1, d(27,1)), loan('ht-pistola-calafateo', 'rp-hector', 1, d(27,1)),
    loan('ht-pica', 'rp-hector', 1, d(27,1)), loan('ht-palin', 'rp-hector', 1, d(27,1)),
    loan('ht-martillo', 'rp-hector', 1, d(27,1)), loan('ht-bomba', 'rp-hector', 1, d(29,1)),
    loan('ht-codal', 'rp-hector', 1, d(31,1)), loan('ht-cortatubo', 'rp-hector', 1, d(2,2)),
    loan('ht-plomada', 'rp-hector', 1, d(7,2)), loan('ht-serrucho-drywall', 'rp-hector', 1, d(19,2)),
    loan('ht-machete', 'rp-hector', 1, d(20,2)), loan('ht-serrucho', 'rp-hector', 1, d(26,2)),
    loan('ht-pica', 'rp-hector', 1, d(30,4)), loan('ht-palin', 'rp-hector', 1, d(30,4)),
    loan('ht-pala', 'rp-hector', 1, d(30,4)), loan('ht-reflectores', 'rp-hector', 1, d(27,1)),

    // ── HERRAMIENTAS MANUALES – Juan Echeverry ──
    loan('ht-escoba', 'rp-juan-echeverry', 1, d(20,1)), loan('ht-trapera', 'rp-juan-echeverry', 1, d(20,1)),
    loan('ht-metro', 'rp-juan-echeverry', 1, d(27,1)), loan('ht-cincel', 'rp-juan-echeverry', 1, d(6,2)),
    loan('ht-serrucho', 'rp-juan-echeverry', 1, d(10,3)), loan('ht-llaves-hex', 'rp-juan-echeverry', 1, d(28,3)),
    loan('ht-nivel', 'rp-juan-echeverry', 1, d(28,3)), loan('ht-codal', 'rp-juan-echeverry', 1, d(8,4)),
    loan('ht-codal', 'rp-juan-echeverry', 1, d(8,4)), loan('ht-palustre', 'rp-juan-echeverry', 1, d(20,4)),
    loan('ht-nivel', 'rp-juan-echeverry', 1, d(30,4)), loan('ht-bichiroqui', 'rp-juan-echeverry', 1, d(30,4)),
    loan('ht-bichiroqui', 'rp-juan-echeverry', 1, d(30,4)),

    // ── HERRAMIENTAS MANUALES – Juan Salazar ──
    loan('ht-almadana', 'rp-juan-salazar', 1, d(6,4)), loan('ht-martillo', 'rp-juan-salazar', 1, d(6,4)),
    loan('ht-espatula', 'rp-juan-salazar', 1, d(6,4)), loan('ht-espatula', 'rp-juan-salazar', 1, d(6,4)),
    loan('ht-pistola-calafateo', 'rp-juan-salazar', 1, d(6,4)), loan('ht-llana', 'rp-juan-salazar', 1, d(6,4)),
    loan('ht-llaves-hex', 'rp-juan-salazar', 1, d(29,4)),

    // ── Jorman ──
    loan('ht-escoba', 'rp-jorman', 1, d(7,3)), loan('ht-pala', 'rp-jorman', 1, d(7,3)),
    loan('ht-espatula', 'rp-jorman', 1, d(29,4)),

    // ── HERRAMIENTAS MANUALES – Jesús Vázquez ──
    loan('ht-plomada', 'rp-jesus', 1, d(6,2)), loan('ht-palustre', 'rp-jesus', 1, d(6,2)),
    loan('ht-palustre', 'rp-jesus', 1, d(6,2)), loan('ht-nivel-mano', 'rp-jesus', 1, d(6,2)),
    loan('ht-almadana', 'rp-jesus', 1, d(6,2)), loan('ht-espatula-pequena', 'rp-jesus', 1, d(28,2)),
    loan('ht-espatalon', 'rp-jesus', 1, d(28,2)), loan('ht-pala', 'rp-jesus', 1, d(2,3)),
    loan('ht-pala', 'rp-jesus', 1, d(2,3)), loan('ht-paleta-plastica', 'rp-jesus', 1, d(11,3)),
    loan('ht-paleta-plastica', 'rp-jesus', 1, d(11,3)), loan('ht-llana-lisa', 'rp-jesus', 1, d(11,3)),
    loan('ht-martillo', 'rp-jesus', 1, d(4,4)),

    // ── Sebastián ──
    loan('ht-nivel', 'rp-sebastian', 1, d(28,3)), loan('ht-martillo', 'rp-sebastian', 1, d(31,3)),
    loan('ht-martillo', 'rp-sebastian', 1, d(8,4)), loan('ht-cincel', 'rp-sebastian', 1, d(16,4)),

    // ── Jorge / Germán ──
    loan('ht-pala', 'rp-jorge', 1, d(21,3)), loan('ht-barra', 'rp-jorge', 1, d(21,3)),
    loan('ht-pala', 'rp-jorge', 1, d(21,3)), loan('ht-pala', 'rp-jorge', 1, d(21,3)),

    // ── HERRAMIENTAS MANUALES – Ricardo ──
    loan('ht-pala', 'rp-ricardo', 1, d(16,2)), loan('ht-alicate', 'rp-ricardo', 1, d(18,2)),
    loan('ht-pala-coca', 'rp-ricardo', 1, d(4,3)), loan('ht-codal', 'rp-ricardo', 1, d(11,3)),
    loan('ht-codal', 'rp-ricardo', 1, d(11,3)), loan('ht-palustre', 'rp-ricardo', 1, d(18,4)),
    loan('ht-pala', 'rp-ricardo', 1, d(25,4)), loan('ht-pala', 'rp-ricardo', 1, d(25,4)),
    loan('ht-pica', 'rp-ricardo', 1, d(25,4)), loan('ht-palin', 'rp-ricardo', 1, d(25,4)),
    loan('ht-paleta', 'rp-ricardo', 1, d(25,4)), loan('ht-llana', 'rp-ricardo', 1, d(25,4)),
    loan('ht-martillo', 'rp-ricardo', 1, d(30,4)), loan('ht-manguera-nivel', 'rp-ricardo', 1, d(30,4)),
    loan('ht-nivel', 'rp-ricardo', 1, d(28,3)), loan('ht-equipo-topo', 'rp-ricardo', 1, d(7,5)),
    loan('ht-almadana', 'rp-ricardo', 1, d(7,5)), loan('ht-machete', 'rp-ricardo', 1, d(7,5)),
    loan('ht-machete', 'rp-ricardo', 1, d(7,5)), loan('ht-rastrillo', 'rp-ricardo', 1, d(7,5)),
    loan('ht-pica', 'rp-ricardo', 1, d(7,5)), loan('ht-liansa', 'rp-ricardo', 1, d(7,5)),
    loan('ht-barra', 'rp-ricardo', 1, d(7,5)),

    // ── William ──
    loan('ht-machete', 'rp-william', 1, d(24,4)), loan('ht-paleta', 'rp-william', 1, d(30,4)),

    // ── HERRAMIENTAS ELÉCTRICAS – Alex ──
    loan('et-pulidora-grande', 'rp-alex', 1, d(9,5)), loan('et-taladro-demoledor', 'rp-alex', 1, d(6,5)),
    loan('et-radial', 'rp-alex', 1, d(24,3)), loan('et-extension', 'rp-alex', 1, d(7,2)),
    loan('et-extension', 'rp-alex', 1, d(21,1)), loan('et-extension', 'rp-alex', 1, d(15,1)),
    loan('et-vibrador', 'rp-alex', 1, d(11,4)),

    // ── Andrés ──
    loan('et-taladro-inalambrico', 'rp-andres', 1, d(1,5)), loan('et-extension', 'rp-andres', 1, d(4,2)),

    // ── Brian ──
    loan('et-pulidora-pequena', 'rp-brian', 1, d(5,5)),

    // ── Carlos García eléctrico ──
    loan('et-pulidora-grande', 'rp-carlos-garcia', 1, d(27,4)), loan('et-extension', 'rp-carlos-garcia', 1, d(20,4)),
    loan('et-extension', 'rp-carlos-garcia', 1, d(17,4)), loan('et-extension', 'rp-carlos-garcia', 1, d(28,1)),
    loan('et-nivel-laser', 'rp-carlos-garcia', 1, d(27,4)),

    // ── Carlos Torrealba ──
    loan('et-pulidora-pequena', 'rp-carlos-torrealba', 1, d(8,5)), loan('et-soldador-pequeno', 'rp-carlos-torrealba', 1, d(8,5)),

    // ── Dani eléctrico ──
    loan('et-radial', 'rp-dani', 1, d(8,5)), loan('et-mezcladora', 'rp-dani', 1, d(9,5)),
    loan('et-pulidora-pequena', 'rp-dani', 1, d(9,5)), loan('et-cortadora-enchape', 'rp-dani', 1, d(8,5)),

    // ── Ferney eléctrico ──
    loan('et-taladro-alambrico', 'rp-ferney', 1, d(13,1)),

    // ── Haider ──
    loan('et-extension', 'rp-haider', 1, d(13,3)),

    // ── Héctor eléctrico ──
    loan('et-pulidora-grande', 'rp-hector', 1, d(5,5)), loan('et-taladro-percutor', 'rp-hector', 1, d(4,5)),
    loan('et-extension', 'rp-hector', 1, d(18,3)), loan('et-extension', 'rp-hector', 1, d(27,1)),
    loan('et-extension', 'rp-hector', 1, d(27,1)), loan('et-nivel-laser', 'rp-hector', 1, d(1,5)),
    loan('et-taladro-demoledor', 'rp-hector', 1, d(9,4)),

    // ── Jesús eléctrico ──
    loan('et-taladro-percutor', 'rp-jesus', 1, d(9,5)), loan('et-pulidora-pequena', 'rp-jesus', 1, d(1,5)),
    loan('et-extension', 'rp-jesus', 1, d(7,5)), loan('et-extension', 'rp-jesus', 1, d(25,4)),

    // ── Juan Echeverry eléctrico ──
    loan('et-taladro-inalambrico', 'rp-juan-echeverry', 1, d(4,5)),

    // ── Juan Salazar eléctrico ──
    loan('et-lijadora', 'rp-juan-salazar', 1, d(6,5)),

    // ── Mello ──
    loan('et-pulidora-pequena', 'rp-mello', 1, d(9,5)),

    // ── Ricardo eléctrico ──
    loan('et-radial', 'rp-ricardo', 1, d(7,5)), loan('et-pulidora-grande', 'rp-ricardo', 1, d(8,4)),
    loan('et-taladro-alambrico', 'rp-ricardo', 1, d(1,5)), loan('et-taladro-inalambrico', 'rp-ricardo', 1, d(24,4)),

    // ── Sebastián eléctrico ──
    loan('et-extension', 'rp-sebastian', 1, d(25,3)), loan('et-extension', 'rp-sebastian', 1, d(6,3)),

    // ── William eléctrico ──
    loan('et-taladro-demoledor', 'rp-william', 1, d(8,5)), loan('et-pulidora-pequena', 'rp-william', 1, d(6,5)),
    loan('et-pulidora-pequena', 'rp-william', 1, d(17,4)), loan('et-taladro-percutor', 'rp-william', 1, d(6,5)),
    loan('et-nivel-laser', 'rp-william', 1, d(8,5)),

    // ── Yesid ──
    loan('et-taladro-alambrico', 'rp-yesid', 1, d(2,5)),

    // ── CONSUMIBLES – 09/05/2026 ──
    consume('su-tornillos-2', 'rp-dani', 50, d(9,5)), consume('su-clavos-acero-3', 'rp-dani', 100, d(9,5)),
    consume('su-lapiz', 'rp-dani', 1, d(9,5)), consume('su-clavos-hierro-2', 'rp-dani', 100, d(9,5)),
    consume('su-silicona', 'rp-adrian', 2, d(9,5)),
    consume('su-tornillos-2', 'rp-andres', 200, d(9,5)), consume('su-tornillos-1-5', 'rp-andres', 200, d(9,5)),
    consume('su-tornillos-0-5', 'rp-andres', 200, d(9,5)),
    consume('su-estopa', 'rp-jorman', 1, d(9,5)), consume('su-brocha-3', 'rp-jorman', 2, d(9,5)),
    consume('su-galon-3en1', 'rp-jorman', 1, d(9,5)), consume('su-gasolina', 'rp-jorman', 1, d(9,5)),
    consume('su-trapo', 'rp-jorman', 1, d(9,5)),
    consume('su-lija-2000', 'rp-ferney', 5, d(9,5)), consume('su-lija-1500', 'rp-ferney', 5, d(9,5)),

    // ── CONSUMIBLES – 08/05/2026 ──
    consume('su-cinta-negra', 'rp-ferney', 1, d(8,5)), consume('su-lampara-12w', 'rp-ferney', 2, d(8,5)),
    consume('su-barniz', 'rp-ferney', 1, d(8,5)), consume('su-acido', 'rp-ferney', 1, d(8,5)),
    consume('su-clavos-acero', 'rp-anderson', 2, d(8,5)),
    consume('su-sifon', 'rp-william', 2, d(8,5)), consume('su-semicodo', 'rp-william', 3, d(8,5)),
    consume('su-tubo', 'rp-dani', 2, d(8,5)),

    // ── EPP – 09/05 ──
    consume('ppe-guantes-naranjas', 'rp-jorge', 1, d(9,5)), consume('ppe-guantes-negros', 'rp-raul', 1, d(9,5)),
    consume('ppe-guantes-negros', 'rp-dani', 1, d(9,5)), consume('ppe-guantes-negros', 'rp-alex', 6, d(9,5)),
    consume('ppe-guantes-naranjas', 'rp-alex', 4, d(9,5)),

    // ── EPP – 29/04 ──
    consume('ppe-guantes-caucho', 'rp-ricardo', 1, d(29,4)), consume('ppe-guantes-negros', 'rp-ricardo', 1, d(29,4)),
    consume('ppe-guantes-negros', 'rp-hector', 1, d(29,4)), consume('ppe-guantes-negros', 'rp-jesus', 1, d(29,4)),
    consume('ppe-guantes-negros', 'rp-anderson', 3, d(29,4)), consume('ppe-guantes-naranjas', 'rp-william', 1, d(29,4)),

    // ── EPP – 28/04 ──
    consume('ppe-guantes-negros', 'rp-anderson', 1, d(28,4)), consume('ppe-guantes-naranjas', 'rp-alex', 1, d(28,4)),

    // ── EPP – 27/04 ──
    consume('ppe-guantes-negros', 'rp-hector', 1, d(27,4)), consume('ppe-guantes-negros', 'rp-anderson', 1, d(27,4)),
    consume('ppe-guantes-negros', 'rp-carlos-garcia', 1, d(27,4)),

    // ── EPP – 25/04 ──
    consume('ppe-guantes-negros', 'rp-anderson', 1, d(25,4)), consume('ppe-guantes-negros', 'rp-carlos-garcia', 1, d(25,4)),
    consume('ppe-guantes-naranjas', 'rp-jorge', 1, d(25,4)), consume('ppe-impermeable', 'rp-jorge', 1, d(25,4)),
    consume('ppe-impermeable', 'rp-jorman', 1, d(25,4)), consume('ppe-guantes-naranjas', 'rp-william', 1, d(25,4)),

    // ── EPP – 24/04 ──
    consume('ppe-guantes-negros', 'rp-hector', 1, d(24,4)), consume('ppe-guantes-azules', 'rp-adrian', 1, d(24,4)),
    consume('ppe-gafas-negras', 'rp-alex', 1, d(24,4)), consume('ppe-botas', 'rp-alex', 1, d(24,4)),
    consume('ppe-guantes-azules', 'rp-juan-echeverry', 1, d(24,4)), consume('ppe-guantes-naranjas', 'rp-mello', 1, d(24,4)),
    consume('ppe-guantes-negros', 'rp-juan-salazar', 1, d(24,4)), consume('ppe-guantes-negros', 'rp-william', 1, d(24,4)),

    // ── EPP – 23/04 ──
    consume('ppe-guantes-negros', 'rp-william', 1, d(23,4)), consume('ppe-guantes-negros', 'rp-juan-echeverry', 1, d(23,4)),
    consume('ppe-gafas-negras', 'rp-brian', 1, d(23,4)), consume('ppe-guantes-negros', 'rp-carlos-garcia', 1, d(23,4)),
    consume('ppe-guantes-negros', 'rp-ferney', 1, d(23,4)), consume('ppe-guantes-naranjas', 'rp-jorman', 1, d(23,4)),
    consume('ppe-gafas-negras', 'rp-sebastian', 1, d(23,4)), consume('ppe-guantes-negros', 'rp-anderson', 1, d(23,4)),
    consume('ppe-guantes-negros', 'rp-adrian', 1, d(23,4)), consume('ppe-gafas-negras', 'rp-jorman', 1, d(23,4)),

    // ── EPP – 22/04 ──
    consume('ppe-guantes-negros', 'rp-ferney', 1, d(22,4)), consume('ppe-guantes-negros', 'rp-jorman', 1, d(22,4)),
    consume('ppe-guantes-negros', 'rp-adrian', 1, d(22,4)), consume('ppe-guantes-negros', 'rp-duvan', 1, d(22,4)),

    // ── EPP – 21/04 ──
    consume('ppe-tapaoidos', 'rp-jorman', 1, d(21,4)), consume('ppe-guantes-naranjas', 'rp-andres', 1, d(21,4)),
    consume('ppe-guantes-naranjas', 'rp-jorge', 1, d(21,4)),
];

// ── PROYECTOS ────────────────────────────────────────────────────────────────
export const realProjects: Project[] = [
    { id: 'rproj-1', name: 'Torre Residencial Norte', description: 'Obra principal', status: 'active' },
    { id: 'rproj-2', name: 'Mantenimiento General', description: 'Reparaciones varias', status: 'active' },
    { id: 'rproj-3', name: 'Remodelación Oficinas', description: 'Pisos 4 y 5', status: 'active' },
];
