---
name: using-superpowers
description: Use when starting any session — establishes how and when to invoke skills. Skill invocation is mandatory, not optional.
---

# Using Superpowers

## Regla fundamental
**Invocar el skill relevante ANTES de cualquier respuesta o acción.**
Si hay un 1% de probabilidad de que aplique un skill → invocar el skill.

## Prioridad de instrucciones
1. Instrucciones explícitas del usuario (CLAUDE.md, mensajes directos) — máxima prioridad
2. Skills de Superpowers — sobreescriben comportamiento por defecto
3. System prompt por defecto — menor prioridad

## Orden de skills cuando aplican múltiples
1. **Skills de proceso primero** (`brainstorming`, `systematic-debugging`) — determinan el CÓMO
2. **Skills de implementación segundo** — guían la ejecución

## Tipos de skills
- **Rígidos** (`test-driven-development`, `systematic-debugging`): seguir exactamente
- **Flexibles** (patrones): adaptar principios al contexto

## Señales de alerta — si piensas esto, PARA:
| Pensamiento | Realidad |
|---|---|
| "Es solo una pregunta simple" | Las preguntas son tareas. Verificar skills. |
| "Necesito más contexto primero" | El skill te dice CÓMO obtener contexto. |
| "Este skill es exagerado" | Las cosas simples se complican. Usarlo. |
| "Recuerdo este skill" | Los skills evolucionan. Leer versión actual. |

## Flujo
`Mensaje recibido` → `¿Aplica algún skill?` → `Sí: invocar` → `Seguir skill` → `Responder`
