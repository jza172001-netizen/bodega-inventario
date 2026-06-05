---
name: dispatching-parallel-agents
description: Use when you have 2+ independent tasks that don't share state and can run simultaneously. Reduces total time by running agents concurrently.
---

# Dispatching Parallel Agents

**Core idea:** Lanzar múltiples agentes al mismo tiempo para tareas independientes en lugar de hacerlas una por una.

## Cuándo aplicar
- 2+ tareas que no comparten estado entre sí
- 3+ errores de test con diferentes causas raíz
- Investigaciones en distintas partes del codebase

## Cuándo NO aplicar
- Las tareas dependen entre sí (A necesita el resultado de B)
- Los agentes modificarían los mismos archivos
- Se requiere entendimiento completo del sistema antes de actuar

## Proceso

### 1. Agrupar
Categoriza las tareas por subsistema independiente.

### 2. Crear prompts enfocados
Cada agente recibe:
- Contexto aislado (solo lo necesario para SU tarea)
- Scope claro (qué archivos, qué función)
- Output específico esperado

### 3. Despachar simultáneamente
Lanzar todos en el mismo mensaje — un tool call por agente.

### 4. Integrar resultados
- Revisar que los cambios no se contradigan
- Validar el sistema completo después de integrar

## Ejemplo real
6 errores de test en 3 archivos → 3 agentes en paralelo:
- Agente A: abort logic
- Agente B: batch completion
- Agente C: race conditions
→ Los 3 entregaron fixes sin conflictos.
