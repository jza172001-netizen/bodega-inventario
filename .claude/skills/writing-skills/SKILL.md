---
name: writing-skills
description: Use when creating a new custom skill or editing an existing one. Applies TDD methodology to skill documentation.
---

# Writing Skills

**Principio:** Escribir skills ES TDD aplicado a documentación de procesos.

## Regla: NO SKILL SIN TEST PRIMERO
Aplica para skills nuevos Y ediciones de existentes.

## Estructura del skill (frontmatter obligatorio)
```yaml
---
name: nombre-en-kebab-case
description: Use when... [máx 1024 chars, solo condición de activación]
---
```
**Nunca resumir el workflow en el description** — Claude seguirá el resumen en vez de leer el skill completo.

## Estructura del contenido
1. Principio core (1-2 oraciones)
2. Cuándo usar (síntomas, casos de uso)
3. Patrón core (para técnicas/patrones)
4. Tablas de referencia rápida
5. Detalles de implementación
6. Errores comunes

## Ciclo RED-GREEN-REFACTOR para skills

**RED:** Ejecutar escenarios de presión SIN el skill. Documentar comportamientos problemáticos verbatim.

**GREEN:** Escribir skill mínimo que resuelve esos fallos específicos.

**REFACTOR:** Identificar nuevas racionalizaciones y añadir contadores explícitos.

## Anti-patrones a evitar
- Ejemplos narrativos de sesiones pasadas específicas
- Labels genéricos (helper1, step3)
- Código en múltiples idiomas que diluye el skill
- Flowcharts excepto para decisiones no obvias

## Para skills de bodega-inventario
Guardar en: `/home/user/bodega-inventario/.claude/skills/<nombre>/SKILL.md`
Así persisten entre sesiones con el proyecto.
