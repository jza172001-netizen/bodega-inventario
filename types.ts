
export enum UserRole {
    OWNER    = 'owner',
    EMPLOYEE = 'employee',
    VISITOR  = 'visitor',
}

export interface AppUser {
    id: string;
    username: string;
    password: string;
    /** SHA-256 de la contraseña — único dato de credencial que se persiste localmente (login offline) */
    passwordHash?: string;
    role: UserRole;
    name: string;
    setupComplete?: boolean;
}

export enum InventoryType {
    HAND_TOOL = 'Herramienta Manual',
    ELECTRICAL_TOOL = 'Herramienta Eléctrica',
    PPE = 'Equipo de Protección Personal',
    SINGLE_USE = 'Material de Consumo',
    /**
     * El catálogo de accesorios: discos, brocas, y lo raro que trae una
     * herramienta suelta (el soporte del láser, su caja).
     *
     * Es una lista APARTE, no una parte del inventario de consumibles. Antes
     * "engancharle un accesorio" a una pulidora abría la lista completa de
     * consumibles de la bodega —bombillos, estopa, gafas, clavos—, que no son
     * accesorios de nada. Los accesorios se cuentan aparte porque son otra
     * cosa: un disco no es una libra de clavos.
     *
     * Se gastan, como los consumibles, así que salen pegados a su herramienta
     * y descuentan del suyo; pero viven en su propia lista y solo se pueden
     * enganchar a herramientas eléctricas y manuales.
     */
    ACCESSORY = 'Accesorio',
}

export enum MovementType {
    PURCHASE = 'Compra',
    CHECK_IN = 'Entrada',
    CHECK_OUT = 'Salida',
    WASTE = 'Merma',
}

export enum PurchaseOrderStatus {
    ORDERED = 'Ordenado',
    SHIPPED = 'Enviado',
    RECEIVED = 'Recibido',
    CANCELLED = 'Cancelado',
}

export type ReturnCondition = 'good' | 'worn' | 'incomplete' | 'damaged' | 'needs_maintenance';

/**
 * Un accesorio de una herramienta. Hay dos clases y la diferencia es de
 * negocio, no de forma:
 *  · Sin `itemId` — retornable (maleta, llave, cargador): sale y vuelve CON la
 *    herramienta, y se revisa al devolverla.
 *  · Con `itemId` — consumible (disco, broca): es un ítem del inventario con su
 *    propio stock, sale pegado a la herramienta, se gasta y no vuelve.
 */
export interface Accessory {
    nombre: string;
    itemId?: string;
    cantidad?: number;
}

export interface Item {
    id: string;
    name: string;
    category: string;
    subCategory: string;
    inventoryType: InventoryType;
    quantity: number;
    minStock: number;
    price?: number;
    unit: string;
    color?: string;
    brand?: string;
    requiresReturnNote?: boolean;
    accessories?: Accessory[];
    /**
     * El ciclo de una herramienta dañada, con un humano confirmando cada paso.
     *
     * Antes devolver algo "dañado" guardaba la palabra en el movimiento y ahí
     * moría: nadie volvía a acordarse de mandarla a arreglar, ni de reclamarla
     * cuando ya estaba lista. Son dos olvidos distintos y los dos cuestan plata.
     *
     * Los tres estados son los tres momentos reales: se dañó y está acá; se
     * mandó y está donde el técnico; volvió arreglada. La app NO los adelanta
     * sola — cada paso lo marca el bodeguero, porque solo él sabe si la
     * herramienta salió de verdad para el taller.
     */
    reparacion?: EstadoReparacion;
    /** Familia confirmada por el usuario. Sin ella se usa la sugerencia del nombre. */
    familia?: string;
    /** Cuándo se tocó por última vez. Es lo que decide quién gana cuando dos
     *  teléfonos traen la misma fila distinta. Ver `masReciente` en App.tsx. */
    updatedAt?: Date;
}

/** Un paso del ciclo de reparación, con la fecha en que se dio. */
export interface EstadoReparacion {
    estado: 'dañada' | 'enviada' | 'arreglada';
    /** Cuándo se marcó dañada. Es la fecha con la que se cuentan los días. */
    desde: Date;
    /** Cuándo se mandó al taller. */
    enviadaEl?: Date;
    /** Cuándo volvió arreglada. */
    devueltaEl?: Date;
    /** Qué le pasó, en las palabras de quien la recibió. */
    nota?: string;
    /** Quién marcó el último paso. */
    porQuien?: string;
}

export interface Project {
    id: string;
    name: string;
    description?: string;
    status: 'active' | 'completed';
}

export interface Movement {
    id: string;
    itemId: string;
    type: MovementType;
    quantity: number;
    timestamp: Date;
    personnelId?: string;
    notes?: string;
    projectId?: string; // Link movement to a project
    isLoan?: boolean;
    isReturned?: boolean;
    pendingPickup?: boolean;
    returnCondition?: ReturnCondition;
    returnNotes?: string;
    /** Cuándo volvió la herramienta a la bodega. Antes solo se guardaba QUE había
     *  vuelto y en qué estado, nunca cuándo: una devolución de hoy seguía
     *  apareciendo en el historial con la fecha de su salida. */
    returnedAt?: Date;
    updatedAt?: Date;
}

export interface Personnel {
    id: string;
    name: string;
    phone?: string;
    isTeamLeader?: boolean;
    teamLeaderId?: string;
    updatedAt?: Date;
}

export interface PurchaseOrderItem {
    itemId: string;
    quantity: number;
    price: number;
}

export interface PurchaseOrder {
    id: string;
    supplier: string;
    items: PurchaseOrderItem[];
    status: PurchaseOrderStatus;
    orderDate: Date;
    expectedDeliveryDate?: Date;
    receivedDate?: Date;
    notes?: string;
}

export interface AuditLog {
    id: string;
    timestamp: Date;
    action: string;
    actor: string;
    description: string;
    /**
     * Desde dónde se hizo: `'chat'` si salió del asistente, sin poner nada si
     * salió de las pantallas normales. Es lo que le permite al chat mostrar SU
     * historial —lo que se hizo desde ahí— en cualquier celular, sin una tabla
     * aparte: la bitácora ya se sincroniza sola entre teléfonos.
     */
    origen?: string;
}

export interface BehaviorLog {
    id: string;
    timestamp: Date;
    actor: string;
    action: string;
    detail: string;
}

/**
 * Una línea que la bodega no dejó salir, con TODO lo que hace falta para
 * resolverla ahí mismo. Antes esto era un simple `false`: el chat solo podía
 * decir "falta de stock" y mandar al bodeguero a arreglarlo por otro lado,
 * que es justo lo contrario de para lo que existe el chat.
 */
export interface RechazoStock {
    itemId: string;
    nombre: string;
    unidad: string;
    /** Lo que había cuando se intentó, ya descontado lo que salió antes en el mismo lote. */
    hay: number;
    pedido: number;
    /** La línea tal cual, para poder reintentarla sin rearmar nada. */
    movimiento: Omit<Movement, 'id'>;
}

export interface LoteResultado {
    ok: number;
    /** Total de líneas REALMENTE intentadas, ya expandidos los accesorios. */
    total: number;
    rechazos: RechazoStock[];
}

/**
 * Un renglón de la lista de pedidos: lo que hay que comprar.
 *
 * A propósito NO está atado al inventario. El bodeguero anota "3 bultos de
 * lechada" mientras camina por la bodega, sin que eso mueva cantidades de nada
 * ni exija que el ítem exista. Es una libreta, y una libreta no debe pedir
 * permiso.
 */
export interface OrderNote {
    id: string;
    texto: string;
    cantidad?: number;
    unidad?: string;
    /** De qué familia salió, cuando vino de una sugerencia de consumo. */
    familia?: string;
    /** El color, cuando importa para comprar: la lechada es gris o es beige, y
     *  "3 bultos de lechada" no alcanza para ir a la ferretería. Va aparte del
     *  texto para poder pintarlo del color que es, como en el resto de la app. */
    color?: string;
    comprado: boolean;
    /**
     * Ya llegó a la bodega y entró al inventario.
     *
     * "Comprado" y "recibido" no son lo mismo, y esa diferencia es justo la que
     * la libreta no sabía anotar: se pide una cosa y llega otra, se piden 5 y
     * llegan 3, o no llega nada. Marcar la compra no puede mover el inventario;
     * confirmar lo que de verdad llegó, sí.
     *
     * Con esto la app deja de llevar solo la trazabilidad de lo que sale y
     * empieza a llevar la de lo que entra, sin tener que cargar el inventario
     * entero de golpe: se va completando pedido a pedido.
     */
    recibido?: boolean;
    /** Cuánto llegó de verdad, que puede no ser lo que se pidió. */
    recibidoQty?: number;
    /** A qué ítem del inventario entró. */
    itemId?: string;
    recibidoAt?: Date;
    createdAt: Date;
    updatedAt?: Date;
}
