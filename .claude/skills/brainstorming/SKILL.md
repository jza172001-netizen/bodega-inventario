---
name: brainstorming
description: Use when starting any new feature or design decision — before writing any code. Explores options, asks clarifying questions, and produces a written spec for approval.
---

# Brainstorming

**Regla dura: NO invocar ningún skill de implementación, NO escribir código, NO hacer scaffolding hasta que el usuario haya aprobado el diseño.**

## Proceso (9 pasos)

1. Explorar contexto del proyecto (archivos, CLAUDE.md, patterns existentes)
2. Ofrecer companion visual si aplica (mockups, diagramas)
3. Hacer preguntas de aclaración — UNA por mensaje, preferir múltiple opción
4. Proponer 2-3 enfoques con sus tradeoffs
5. Presentar secciones del diseño
6. Escribir spec en `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
7. Auto-revisión: ¿hay placeholders? ¿contradicciones? ¿ambigüedades?
8. Obtener revisión del usuario sobre la spec escrita
9. Invocar skill `writing-plans` para pasar a implementación

## Principios clave
- Una pregunta por mensaje
- Diseñar con límites claros entre componentes
- Aplicar YAGNI: solo lo necesario
- Proyectos "simples" son donde los supuestos sin examinar causan más trabajo desperdiciado

## Anti-patrón
No saltar a `writing-plans` sin haber escrito y aprobado la spec primero.
