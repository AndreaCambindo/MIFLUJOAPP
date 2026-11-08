# MiFlujo

App web instalable (PWA) para llevar pagos mensuales, agenda, flujo de caja, inversiones y créditos.
**Los datos de cada persona viven en un archivo de Google Sheets (Excel) en su propio Drive.** Tú, como quien distribuye la app, nunca ves sus datos.

Archivos: `index.html` (toda la app), `manifest.webmanifest`, `sw.js` (funciona sin conexión), iconos, y la carpeta `licencias/` (servidor de licencias; solo para quien vende, **no la subas al hosting público**).

## Cómo funciona

- Cada persona entra con su cuenta de Google. La app crea un archivo **"MiFlujo - Datos"** en su Drive con 7 hojas: Config, Ingresos, Pagos, Gastos, Agenda, Inversiones, Creditos.
- **Ingresos:** se pueden registrar varios (sueldo, honorarios, ventas…), mensuales o de "solo una vez", y se suman.
- **Reportes:** semáforo del mes (verde / amarillo / rojo), recomendaciones, proyección a 3, 6 y 12 meses, historial, exportar a PDF o CSV y una tarjeta por mes para descargar o compartir (con opción de ocultar montos).
- **Moneda:** Ajustes (engranaje) → Moneda. Se detecta según el idioma del dispositivo la primera vez.
- Permiso que se pide: `drive.file` (solo ve archivos que creó esta app, no el resto del Drive).
- Se puede abrir y editar el Excel a mano; la app lee los cambios (filas sin `id` se arreglan solas).
- Sin internet la app sigue funcionando y sincroniza al volver la conexión.
- También hay "modo local" (sin Google) para probarla.
- **Dímelo (botón del micrófono):** escribe o dicta una frase (“gasté 45 mil en el mercado ayer”, “me entraron 800 mil de freelance”, “pagué el arriendo”, “recuérdame el viernes a las 3 la cita con el odontólogo”). Entiende montos (mil, millón, lucas), fechas (hoy, ayer, el lunes, el 15 de noviembre) y horas, y **siempre muestra lo entendido para que lo confirmes** antes de guardar. El dictado usa el navegador (en iPhone instalada en pantalla de inicio suele no estar disponible: se usa el micrófono del teclado).
- **Licencias (opcional):** para venderla con código de acceso y suscripción ver `licencias/LEEME.md`.

## Puesta en marcha (una sola vez, ~15 min)

### 1. Probar en tu computador
Google exige una dirección web, no un archivo suelto. En la carpeta del proyecto:

```
python3 -m http.server 8080
```
y abre http://localhost:8080 (Google acepta `localhost` para pruebas). Sin el paso 2 ya puedes usar el modo local.

### 2. Crear el ID de cliente de Google
1. Entra a https://console.cloud.google.com y crea un proyecto (ej. "MiFlujo").
2. **APIs y servicios → Biblioteca**: activa **Google Sheets API** y **Google Drive API**.
3. **Pantalla de consentimiento de OAuth**: tipo *Externo*, nombre "MiFlujo", tu correo de soporte. En *Permisos* agrega `.../auth/drive.file`.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**. En *Orígenes autorizados de JavaScript* agrega `http://localhost:8080` y, después, la URL donde publiques (paso 3). No necesitas URI de redirección.
5. Copia el ID (`xxxx.apps.googleusercontent.com`) y pégalo en `index.html`, en la constante `CLIENT_ID` (al inicio del `<script>`).
6. **Importante para distribuir:** en la pantalla de consentimiento pulsa **"Publicar aplicación"** (estado *En producción*). En modo *Pruebas* solo entran los usuarios que agregues a mano (máx. 100) y la sesión caduca a los 7 días. El permiso `drive.file` no es de los "sensibles", así que normalmente no requiere verificación de Google; si te la pidieran, es un trámite gratuito.

### 3. Publicar (gratis)
Sube la carpeta a cualquier hosting estático con https: **GitHub Pages**, **Netlify** (arrastrar y soltar la carpeta), **Cloudflare Pages** o **Vercel**. Luego agrega esa URL en *Orígenes autorizados* (paso 2.4). Comparte el enlace.

### 4. Que cada persona la instale
- **Android (Chrome):** abrir el enlace → menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** abrir el enlace → Compartir → *Añadir a pantalla de inicio*.
- **Computador (Chrome/Edge):** icono de instalar en la barra de direcciones.

## Límites a tener presentes

- **Avisos:** la app avisa al abrirse (resumen diario si activan notificaciones), no manda notificaciones push con la app cerrada. Para eso, cada cita tiene el botón "Añadir a Google Calendar". Los push reales requieren un servidor y se pueden añadir después.
- **Dos dispositivos a la vez:** gana el último cambio guardado. La app refresca al volver a primer plano.
- **Sesión de Google:** el acceso dura ~1 hora y se renueva en silencio; si el navegador bloquea cookies de terceros, aparece "Reconectar" (un toque).
- Cada persona necesita el enlace publicado; no se distribuye como archivo para abrir con doble clic.

## Cambiar algo
Todo está en `index.html`: columnas del Excel en `TABS`, categorías en `CATS`, monedas en `MONEDAS`, formularios en `FORMS`.
