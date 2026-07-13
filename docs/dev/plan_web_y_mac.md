# Plan: nueva web de AmoxSQL + instalador para macOS (Apple Silicon)

**Fecha:** 2026-07-13 · **Versión app:** v3.8.3
**Alcance:** (A) decisión y rediseño de la página web; (B) instalador macOS M-series por GitHub Actions. Este documento explica el "cómo" y da el plan de implementación por fases. La Fase 0 incluye un **mockup HTML navegable** (entregado como artifact) con la dirección de diseño recomendada.

---

## PARTE A — La página web

### A.1 Estado actual (inventario del repo)
Repo: `github.com/DSandovalFlavio/amoxsql-landing-page` · local: `C:\Users\flavi\Documents\Proyectos\AmoxSQL-page\amoxsql-landing-page`.

- **No es HTML plano:** es una SPA **React 19 + Vite 7**, React Router (`HashRouter`), `lucide-react`, `react-markdown`.
- **Deploy:** GitHub Actions oficial de Pages (`.github/workflows/deploy.yml`) → `https://dsandovalflavio.github.io/amoxsql-landing-page/` (`vite base: '/amoxsql-landing-page/'`). Limpio y automatizado.
- **Bilingüe** (EN/ES) vía Context i18n (~422 líneas de strings) + un **visor de docs propio** que lee markdown de `public/docs/{en,es}/` (~11 páginas/idioma).
- **Analytics:** GA4 (`G-STQ2XM0KXE`) + `trackEvent` (download/github/sponsor).
- **SEO:** OG/Twitter completos; `og:url` **afirma `https://amoxsql.com/`** pero **no hay `CNAME` en el repo** → dominio personalizado ambiguo (verificar en Settings → Pages).
- **Branding ya cian/teal** (`#00DAFF`, `#00d49b`), dark glassmorphism, Inter + JetBrains Mono. **Consistente** con la app.
- **Licencia:** el sitio es **MIT**; la app es **source-available**. Distintas.
- **Tamaño:** ~3,500 LOC en `src/` + ~2,000 líneas de markdown bilingüe + 22 capturas (~2.6 MB en `public/`).

### A.2 Decisión: ¿repo aparte o dentro de AmoxSQL?

**Recomendación: MANTENER el sitio en su propio repo** (`amoxsql-landing-page`) y **rediseñarlo ahí mismo** con la nueva identidad visual. No moverlo al monorepo de la app.

**Por qué (a favor de repo aparte):**
1. **Ciclos de vida y licencias distintos.** El sitio es marketing (MIT, cambia por campañas/diseño); la app es producto source-available (cambia por features/releases). Mezclarlos ensucia la licencia y el historial.
2. **Deploy ya resuelto y limpio.** El sitio ya publica a Pages con Actions. Meterlo al repo de la app obligaría a: un segundo workflow de Pages con subcarpeta, o convertir el Pages del repo principal — fricción sin beneficio. El repo de la app ya tiene CI de releases (Windows/Mac).
3. **Separación de responsabilidades.** El repo de la app está optimizado para código + releases; un sitio de marketing dentro añade ruido (assets, GA4, SEO) sin ganancia.
4. **El problema real no es DÓNDE vive, es que el diseño quedó anticuado.** La solución es rediseñar, no re-ubicar.

**Contra (por qué alguien movería):** un solo repo que mantener. Pero el costo (licencia mezclada, doble Pages, ruido) supera esa comodidad.

**Conclusión:** repo aparte + rediseño en su lugar, reutilizando el pipeline de deploy, la estructura i18n y GA4.

### A.3 Resolver la duplicación de documentación
Ahora que el repo de la app tiene la **guía bilingüe completa** en `docs/` (~57 páginas/idioma), el visor de docs del sitio (con sus ~11 páginas markdown propias) quedó **duplicado y desactualizado**. Opciones:

- **Opción 1 (recomendada, corto plazo):** el sitio **enlaza** a la documentación del repo de la app (`github.com/DSandovalFlavio/AmoxSQL/tree/main/docs`), que GitHub renderiza. El sitio deja de mantener su propio markdown. Simple, una sola fuente de verdad.
- **Opción 2 (mediano plazo):** el sitio **consume** el markdown del repo de la app en build (git submodule o script que hace fetch de `docs/`) y lo renderiza con su propio visor bonito. Una fuente de verdad + docs con el diseño del sitio. Más trabajo.
- **Opción 3:** hostear la doc en un sitio dedicado (Docusaurus/VitePress) — sobredimensionado por ahora.

Recomendación: **Opción 1** ahora; considerar **Opción 2** cuando el sitio esté rediseñado y estable.

### A.4 Dominio personalizado
El OG dice `amoxsql.com` pero no hay `CNAME`. **Acción:** verificar en Settings → Pages del repo del sitio si el dominio está realmente configurado. 
- Si **sí** hay dominio → al rediseñar, conservar el `CNAME` + DNS y **quitar** el `base: '/amoxsql-landing-page/'` (con dominio raíz, `base` debe ser `/`).
- Si **no** → decidir: comprar `amoxsql.com` (recomendado para marca) o seguir en `github.io/amoxsql-landing-page/` (y corregir el `og:url` para que no mienta).

### A.5 Rediseño — enfoque técnico
- **Mantener React 19 + Vite** (ya está montado, bilingüe, deploy funciona). No reescribir el stack; **rehacer el diseño** (componentes, tokens, secciones) y **refrescar el contenido** a v3.8.3.
- **Sistema de diseño nuevo** alineado a la app: tokens oklch, tema oscuro "Amox Dark" (fondo tinta con sesgo teal), acento cian/teal, un acento **dorado de códice** usado con mucha mesura (la tensión "antiguo + moderno" de la marca). Tipografía: sans para cuerpo, **mono como firma** (SQL/terminal) en eyebrows y snippets.
- **Contenido actualizado:** las 8 capacidades reales (Editor SQL, Notebooks, Story Flow, Report Flow, Data Flow, IA agéntica, DBT, Perfilado/Plan), historia del códice, local-first/privacidad, y **descargas Windows + macOS**.
- **Reutilizar:** pipeline de Pages, i18n (EN/ES), GA4 (`trackEvent`), capturas (regenerar las que envejecieron).
- Ver el **mockup de Fase 0** (artifact) para la dirección visual concreta.

---

## PARTE B — Instalador para macOS (Apple Silicon / M-series)

### B.1 Lo que hace fácil esto
- **El repo de AmoxSQL es público → los runners macOS estándar (`macos-14`/`macos-15`, arm64/M1) son GRATIS e ilimitados** en Actions. (El "GitHub da créditos para Mac M" que recordabas = esto; no hay un tier especial de créditos M.)
- **`@duckdb/node-api` es N-API + precompilado** (trae binarios por plataforma vía `optionalDependencies`, nunca compila desde fuente). Es el mayor dolor evitado: **no hay rebuild de ABI**. Basta correr `pnpm install` en un runner **arm64 real** para que baje `@duckdb/node-bindings-darwin-arm64`. No se puede cross-compilar: Mac se construye en Mac.

### B.2 El único dolor real: firma
Sin un **Apple Developer ID ($99/año)**, el `.dmg` arm64 mostrará **"AmoxSQL está dañado y no se puede abrir"** a la mayoría, y en **macOS Sequoia (15) se eliminó el bypass de clic-derecho → Abrir**. El único workaround gratis y confiable hoy es una orden de Terminal: `xattr -cr /Applications/AmoxSQL.app`. Aceptable para público técnico (analistas/ingenieros), fricción para público general.

**Dos caminos:**
- **B-libre (empezar aquí):** publicar sin firmar + instrucción `xattr -cr`. Cero costo.
- **B-firmado (después):** Apple Developer Program $99/año + cert "Developer ID Application" + notarización (`notarytool`, `hardenedRuntime`, entitlements) → doble clic sin fricción. electron-builder v25 lo hace nativo con secrets en CI.

### B.3 Deltas concretos en el repo de la app
1. **`.npmrc` en la raíz** → `node-linker=hoisted` (el layout symlinked de pnpm rompe el empaquetado de electron-builder/optional-deps).
2. **`package.json` → bloque `build`:**
   - `asarUnpack: ["**/node_modules/@duckdb/**"]` (el `.node` y el `.dylib` de DuckDB no cargan desde dentro del asar).
   - Bloque `mac`: target `dmg` + `zip` arch `arm64`, `category: "public.app-category.developer-tools"`.
   - Bloque `dmg` (título + layout Applications).
   - (Para auto-update) bloque `publish` github `{ owner: "DSandovalFlavio", repo: "AmoxSQL" }`.
3. **`.github/workflows/release.yml`** — matriz `windows-latest` + `macos-14`, en push de tag `v*`: checkout → pnpm → setup-node 20 → `pnpm install` (raíz y `client/`) → `electron-builder install-app-deps` → `pnpm client:build` → `electron-builder --win|--mac --arm64 --publish always`. `permissions: contents: write`.
4. **Docs de instalación:** añadir la sección macOS (descarga `.dmg`, y para versión sin firmar el paso `xattr -cr`).

### B.4 Cuidados (arm64 + DuckDB en CI)
- **arm64-only**, no universal (universal duplica tamaño y complica por los binarios arch-específicos de DuckDB).
- `asarUnpack` acotado a `@duckdb/**` (electron-builder 25 tiene un bug de over-unpacking con globs amplios).
- Electron 33 = Node 20.18 embebido (NODE_MODULE_VERSION 130) → `node-version: 20` en CI.
- `install-app-deps` queda casi como no-op para DuckDB, pero se conserva para normalizar el layout y por futuras deps nativas.

---

## PARTE C — Plan de implementación por fases

### Fase 0 — Análisis + mockup (ESTE documento)
- Documento de decisión (web repo aparte + rediseño; instalador Mac libre primero). ✅
- **Mockup HTML de la web** (artifact) con la dirección de diseño. ✅
- Decisiones pendientes del usuario: dominio (`amoxsql.com` sí/no), presupuesto de firma Mac ($99/año sí/no ahora), y si el sitio enlaza o consume la doc.

### Fase 1 — Instalador macOS (rápido, alto impacto)
Trabaja en el repo de la app, rama nueva:
1. `.npmrc` (`node-linker=hoisted`), bloque `mac`/`dmg`/`asarUnpack`/`publish` en `package.json`.
2. `.github/workflows/release.yml` (matriz Win+Mac).
3. Probar con un tag de prueba (o `workflow_dispatch`) → generar `.dmg` arm64 sin firmar.
4. Añadir sección macOS a los docs de instalación (Win + Mac, con `xattr -cr`).
5. Adjuntar el `.dmg` a la release v3.8.3 (o v3.8.4) junto al `.exe`.
> Sin firma = gratis. Firma/notarización = fase opcional posterior si se paga el Developer Program.

### Fase 2 — Rediseño de la web (repo del sitio)
1. Nuevo sistema de tokens/diseño (del mockup aprobado).
2. Rehacer secciones: Hero, Capacidades (8), Local-first, Los Studios, IA, El Códice, Descargas (Win+Mac), Footer.
3. Actualizar contenido a v3.8.3; regenerar capturas envejecidas.
4. Resolver docs (Opción 1: enlazar al `docs/` del repo de la app).
5. Confirmar dominio + `base` correcto; mantener GA4 e i18n.
6. Deploy vía el pipeline de Pages existente.

### Fase 3 — Pulido opcional
- Firma/notarización Mac ($99/año) para doble-clic sin fricción.
- Docs consumidas por el sitio (Opción 2) con su visor.
- Video/tour en la landing.

---

## Decisiones que necesito de ti
1. **Web:** ¿confirmas mantener el repo aparte + rediseñar ahí? (recomendado)
2. **Dominio:** ¿`amoxsql.com` está configurado / lo quieres? ¿o seguimos en `github.io`?
3. **Mac:** ¿empezamos con instalador **sin firmar** (gratis, con `xattr -cr`)? ¿presupuestas los $99/año de Apple Developer para notarizar después?
4. **Orden:** ¿arranco por la **Fase 1 (instalador Mac)** —rápida y de alto impacto para el release— y luego el rediseño web? (recomendado)
