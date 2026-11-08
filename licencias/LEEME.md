# Licencias de MiFlujo — guía de instalación (≈ 30 min, una sola vez)

Qué consigues: nadie abre la app sin un **código de licencia** (`MFL-XXXX-XXXX-XXXX`) que tú entregas. Cada licencia tiene un plan (prueba, mensual, anual, único), una fecha de vencimiento y un máximo de dispositivos (3 por defecto). La app funciona sin internet: guarda un "pase" firmado válido 7 días y lo renueva sola cuando hay conexión.

Los datos financieros de cada persona **nunca** pasan por tu servidor: solo se consulta el código y un identificador anónimo del dispositivo.

> Si dejas `LICENSE_URL` y `LICENSE_PUBLIC_KEY` vacías en `index.html`, la app abre libre (modo gratis). Útil para probar.

## Paso 1 — Generar las claves
1. Abre `generar-claves.html` en tu computador (doble clic; no envía nada a internet).
2. Pulsa **Generar claves**. Verás dos textos: clave **privada** y clave **pública**.
3. Guarda la privada en un gestor de contraseñas. Si generas otro par después, todas las licencias ya entregadas dejan de validar.

## Paso 2 — Crear el servidor en Google
1. En Google Drive crea una hoja de cálculo nueva y llámala "MiFlujo - Licencias".
2. Menú **Extensiones → Apps Script**. Borra el contenido y pega todo `Code.gs`. Guarda.
3. Engranaje **Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad**:
   - `CLAVE_PRIVADA` = la clave privada del paso 1.
   - `URL_APP` = el enlace donde publicarás la app (ej. `https://tuapp.netlify.app`). Se usa en el correo que recibe quien compra.
4. Vuelve a la hoja y recarga la página: aparece el menú **MiFlujo**. Pulsa **1. Configuración inicial** y acepta los permisos (Google avisa "app no verificada": es tu propio script; *Avanzado → Ir a…*). Debe crear las hojas *Licencias* y *Dispositivos* y confirmar que la clave privada funciona.

## Paso 3 — Publicar el servidor
1. En Apps Script: **Implementar → Nueva implementación → Aplicación web**.
2. *Ejecutar como:* **Yo**. *Quién tiene acceso:* **Cualquier persona**.
3. Implementar y copia la **URL de la aplicación web** (termina en `/exec`).
4. Si luego cambias `Code.gs`, usa **Implementar → Administrar implementaciones → editar → Nueva versión**; la URL se mantiene.

## Paso 4 — Conectar la app
En `index.html`, arriba del `<script>`:
```js
const LICENSE_URL = 'https://script.google.com/macros/s/.../exec';
const LICENSE_PUBLIC_KEY = 'MIIBIjANBgkq...';   // la clave pública del paso 1
const SUPPORT = 'soporte@tudominio.com';        // opcional, se muestra en pantalla
```
Sube de nuevo la carpeta a tu hosting. Abre la app: debe pedir el código.

## Paso 5 — Entregar licencias
En la hoja: menú **MiFlujo → Crear licencia…**: te pide el correo y el plan; genera el código y te pregunta si lo envía por correo. **Extender** suma meses a un código y **Revocar** lo bloquea.
- *prueba*: 7 días · *mensual*: 1 mes · *anual*: 1 año · *único*: sin vencimiento.
- Cuando vence hay **3 días de gracia**; después la app bloquea pero deja **exportar los datos** (nunca se secuestran).
- Si alguien cambia de teléfono y llega al máximo de dispositivos, la app le deja liberar uno (o tú lo borras en la hoja *Dispositivos*).

## Cobrar
- **Manual (empieza así):** la persona te paga (transferencia, Nequi, Mercado Pago, etc.) y tú creas el código desde el menú. Cero programación.
- **Automático:** una pasarela (Mercado Pago, Lemon Squeezy, Wompi…) avisa con un *webhook* cuando se paga o se renueva. Eso requiere agregar un endpoint a `Code.gs` que llame a `crearLicencia_` / `extenderLicencia_`. Verifica las condiciones y comisiones vigentes de la pasarela antes de elegir.

## Límites a tener presentes
- Apps Script tiene cuotas diarias (miles de consultas por día en cuentas gratis, menos envíos de correo). Sobra para empezar; con muchos cientos de usuarios activos conviene migrar a un servidor propio.
- Como toda app web, el código se puede leer en el navegador. La protección real es esta: sin licencia vigente el pase no se renueva. Un usuario hábil podría saltarse el bloqueo en su propia copia, pero no obtiene los pases ni las renovaciones.
- Probado con un simulador de Apps Script y navegador automatizado; **la primera instalación real en Google conviene probarla tú con un código de prueba** antes de vender.
