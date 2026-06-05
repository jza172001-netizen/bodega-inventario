---
name: using-git-worktrees
description: Use when you need to work on multiple branches simultaneously without losing progress. Creates isolated workspaces per branch.
---

# Using Git Worktrees

**Para qué sirve:** Trabajar en dos ramas al mismo tiempo. Por ejemplo, tienes un feature a medias y necesitas hacer un hotfix urgente — sin hacer stash ni checkout.

## Proceso

### Paso 0 — Detectar
Verificar si ya estás en un workspace aislado:
```bash
git rev-parse --git-dir
git rev-parse --git-common-dir
```
Si son iguales, NO estás en un worktree.

### Paso 1 — Crear workspace
```bash
mkdir -p .worktrees
git worktree add .worktrees/<nombre-rama> <nombre-rama>
```
Verificar que `.worktrees/` esté en `.gitignore`.

### Paso 2 — Setup del proyecto
```bash
cd .worktrees/<nombre-rama>
npm install   # o el equivalente del proyecto
```

### Paso 3 — Verificar baseline
Correr los tests antes de tocar algo. No proceder si fallan.

### Paso 4 — Limpiar al terminar
```bash
# Desde el repo principal:
git worktree remove .worktrees/<nombre-rama>
git worktree prune
```

## Reglas críticas
- Nunca crear worktrees anidados
- Nunca borrar la rama antes de remover el worktree
- Siempre correr desde la raíz del repo principal para comandos de worktree
