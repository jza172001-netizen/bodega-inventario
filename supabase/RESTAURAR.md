# Cómo reconstruir la base si se pierde

**Verificado el 12 de septiembre de 2026.** Este documento no es teoría: la
migración base se aplicó sobre un PostgreSQL en blanco y las 17 migraciones
siguientes corrieron encima sin un solo error, y después se registró un despacho
de prueba para comprobar que la base quedaba **usable**, no solo creada.

---

## 1. Por qué esto existía como un hueco

Hasta hoy el repositorio **no alcanzaba para reconstruir el servidor**. Las
migraciones asumían tablas, tipos y funciones creados a mano por fuera de Git:
aplicarlas sobre un proyecto en blanco fallaba en la primera línea. Producción
tenía 35 migraciones aplicadas; el repositorio, 17.

O sea: si la base se perdía, se perdía. Ahora no.

---

## 2. El esqueleto

`supabase/migrations/00000000000000_baseline.sql` levanta **la estructura
vacía**: tipos, tablas, claves, restricciones, índices, disparadores, políticas y
funciones, tal como estaban instalados el 12-sep-2026.

Sobre un proyecto nuevo de Supabase, en el editor SQL o con la CLI:

```bash
supabase db push        # aplica todo supabase/migrations/ en orden
```

O a mano, en orden alfabético de archivo. **La base va primera** — el nombre
empieza en ceros justamente para eso.

**Una diferencia a propósito:** producción genera identificadores con
`uuid_generate_v4()`, de la extensión `uuid-ossp`. La migración base usa
`gen_random_uuid()`, que es nativa de PostgreSQL 13 en adelante. El valor que
producen es el mismo; la diferencia es que la base **corre en cualquier parte**,
que es justo para lo que existe.

---

## 3. Los datos

**El esqueleto no trae ni una fila.** Para recuperar de verdad hacen falta los
datos, y eso es aparte.

**Supabase guarda respaldos automáticos** (Dashboard → Database → Backups). Ese
es el camino corto: restaurar el respaldo trae estructura y datos de una, y esta
migración base no hace falta.

**La migración base es para lo que el respaldo no cubre:** montar un proyecto
nuevo, levantar un ambiente de prueba, o reconstruir cuando el respaldo esté
dañado o sea muy viejo.

**El respaldo que puede sacar Juli sin ayuda de nadie** está adentro de la app:
Ajustes → exportar. Baja un JSON con la forma de `storage.ts` (`AppData`). Sirve
para no perder el trabajo del día; **no reemplaza el respaldo de Supabase**,
porque solo trae lo que ese dispositivo tenía.

---

## 4. Comprobar que quedó — la lista

Reconstruir no es «corrió sin error». Es **que los números cuadren**. Cuatro
consultas, y las cuatro se comparan contra lo que había antes:

```sql
-- 1. Artículos
select count(*) as items, sum(quantity) as unidades
from items where deleted_at is null;

-- 2. Préstamos vivos: lo que está fuera de bodega y no ha vuelto
select count(*) as prestamos_activos, sum(quantity) as unidades_afuera
from movements
where is_loan and not is_returned and deleted_at is null;

-- 3. Movimientos
select type, count(*), sum(quantity)
from movements where deleted_at is null group by type order by 1;

-- 4. EL CUADRE DEL KARDEX — el que de verdad importa.
--    Entradas menos salidas tiene que dar el stock de cada ítem.
--    Lo que salga acá es lo que NO cuadra.
select i.name,
       i.quantity as stock,
       coalesce(sum(case when m.type in ('Entrada','Compra') then m.quantity
                         when m.type in ('Salida','Merma')   then -m.quantity end), 0) as segun_el_libro
from items i
left join movements m on m.item_id = i.id and m.deleted_at is null
where i.deleted_at is null
group by i.id, i.name, i.quantity
having i.quantity <> coalesce(sum(case when m.type in ('Entrada','Compra') then m.quantity
                                       when m.type in ('Salida','Merma')   then -m.quantity end), 0);
```

**La consulta 4 tiene que devolver CERO FILAS.** Cada fila que devuelva es un
ítem cuyo stock no lo respalda su historial.

> **Ojo con los préstamos:** una salida prestada y devuelta suma y resta, así que
> su efecto neto es cero y el cuadre funciona igual. Un préstamo **sin devolver**
> sí descuenta, y así debe ser: la herramienta no está en la bodega.

---

## 5. Probar la recuperación sin tocar producción

Lo que se hace acá para verificar, y lo que se puede repetir cuando sea:

```bash
node verificar-baseline.cjs /ruta/al/repo
```

Aplica las 18 migraciones sobre un PostgreSQL embebido en blanco, en orden, y
después registra un despacho para comprobar que la base quedó usable. Si alguna
migración falla, lo dice con su nombre y su motivo.

**Cada vez que se agregue una migración, hay que volver a correr esto.** Una
migración que solo funciona sobre la base que ya existe rompe la reconstrucción
sin que nadie se entere hasta el día que haga falta.

---

## 6. Lo que NO se recupera

- **Las variables de entorno de Vercel.** `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` y `BODEGA_API_TOKEN` viven solo allá. Sin ellas el
  endpoint del asistente no funciona, y no están en ningún respaldo.
- **La clave pública** (`VITE_SUPABASE_ANON_KEY`) cambia con el proyecto: si se
  reconstruye en un proyecto nuevo, hay que actualizarla en Vercel.
- **Lo que cada celular tenga sin sincronizar.** Se sube solo al abrir la app con
  señal, pero si el celular se pierde antes, eso no estaba en ninguna parte.
