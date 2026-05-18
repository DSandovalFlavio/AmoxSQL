---
name: Análisis de Cohortes
description: Cohort retention analysis — how groups of users or customers behave over time after an initial event
keywords: cohort, retention, churn, lifetime, ltv, funnel, conversion, cohorte, retención, retencion, vuelven, retornan, regresan, abandono, grupos, segmento
next: data-storytelling
---

# Análisis de Cohortes

Activa cuando el análisis requiere comparar grupos definidos por un evento de inicio (primera compra, registro, etc.) y rastrear su comportamiento a lo largo del tiempo.

## Cuándo activar

- "¿Cómo es la retención?", "¿los usuarios de enero retornan más que los de marzo?"
- "¿Cuál es el LTV por cohorte?", "¿cuántos vuelven en el segundo mes?"

## Secuencia de análisis

1. **Definir evento de inicio** — primera compra, primer login, fecha de registro, etc.
2. **Construir tabla de cohorte**:
   ```sql
   WITH cohortes AS (
     SELECT user_id,
       DATE_TRUNC('month', MIN(fecha_evento)) AS mes_cohorte
     FROM eventos
     GROUP BY user_id
   ),
   actividad AS (
     SELECT e.user_id,
       c.mes_cohorte,
       DATE_TRUNC('month', e.fecha_evento) AS mes_actividad,
       DATEDIFF('month', c.mes_cohorte, DATE_TRUNC('month', e.fecha_evento)) AS mes_numero
     FROM eventos e
     JOIN cohortes c USING (user_id)
   )
   SELECT mes_cohorte, mes_numero,
     COUNT(DISTINCT user_id) AS usuarios_activos
   FROM actividad
   GROUP BY mes_cohorte, mes_numero
   ORDER BY mes_cohorte, mes_numero
   ```
3. **Calcular tasas de retención** dividiendo por el tamaño inicial de cada cohorte
4. **Visualizar** — `display_chart` tipo `heatmap` (mes_cohorte en Y, mes_numero en X, tasa de retención como valor)
5. **Comparar cohortes** — identificar qué cohorte tiene mejor retención en mes 1, 3 y 6
6. **Cierre** — `final_answer` con: tasa de retención promedio por período, cohorte con mejor/peor desempeño, tendencia de mejora o deterioro

## Adaptaciones comunes

- **Sin user_id**: usar customer_id, session_id, o cualquier identificador de entidad
- **Cohortes semanales**: cambiar `DATE_TRUNC('month', ...)` a `DATE_TRUNC('week', ...)`
- **LTV de cohorte**: sumar revenue en lugar de contar usuarios únicos
