/* ==========================================================================
   Radio Tec · portal de https://radio-tec.github.io
   La radio (sitio PHP + servidor de audio) corre en la computadora de la estación y sale a internet
   por un túnel https de Cloudflare cuya dirección cambia cada vez que se enciende. publicar-en-linea.bat
   escribe esa dirección en /en-linea.json de este repositorio; esta página la lee y:
     - muestra el sitio público dentro de la página (la barra del navegador sigue diciendo radio-tec.github.io);
     - para el panel (/admin, /panel) abre la dirección del túnel directamente (el inicio de sesión
       necesita cookies, que los navegadores no permiten dentro de otra página).
   Si la estación está apagada, muestra un aviso y vuelve a intentar sola.
   ========================================================================== */
(function () {
    'use strict';

    const REINTENTO_SEG = 20;      // espera entre intentos cuando la estación está fuera de línea
    const VIGILANCIA_SEG = 60;     // con el sitio abierto, cada cuánto se revisa que el túnel siga vivo

    const aviso = document.getElementById('aviso');
    const estado = document.getElementById('estado');
    const estadoTexto = document.getElementById('estado-texto');
    const detalle = document.getElementById('detalle');
    const botonReintentar = document.getElementById('reintentar');
    const marco = document.getElementById('sitio');

    let actual = '';               // dirección del túnel que se está mostrando
    let reloj = null;
    let fallosSeguidos = 0;

    /** Qué parte del sitio pidió el visitante (p. ej. radio-tec.github.io/privacidad.html). */
    const ruta = location.pathname.replace(/\/index\.html$/, '/');
    const esPanel = /^\/(admin|panel|entrar)(\/|$)/i.test(ruta);

    function destino(base) {
        if (esPanel) {
            return base + (/^\/admin\/.+\.php$/i.test(ruta) ? ruta : '/admin/login.php');
        }
        const pagina = ruta === '/' ? '/public/' : (/^\/public\//.test(ruta) ? ruta : '/public' + ruta);
        return base + pagina + location.search + location.hash;
    }

    function mostrarAviso(texto, sub, fuera) {
        aviso.hidden = false;
        estado.classList.toggle('fuera', !!fuera);
        estadoTexto.textContent = texto;
        detalle.textContent = sub || '';
        botonReintentar.hidden = !fuera;
    }

    /** Lee la dirección vigente del túnel (sin caché: cambia cada vez que se enciende la radio). */
    async function leerDireccion() {
        const r = await fetch('/en-linea.json?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) { throw new Error('sin en-linea.json'); }
        const d = await r.json();
        const url = String((d && d.url) || '').replace(/\/+$/, '');
        if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(url)) { throw new Error('la estación no ha publicado su dirección'); }
        return url;
    }

    /** ¿Responde de verdad la radio en esa dirección? (un túnel apagado contesta con un error de Cloudflare) */
    async function responde(url) {
        const control = new AbortController();
        const limite = setTimeout(() => control.abort(), 8000);
        try {
            const r = await fetch(url + '/public/api/estado.php?t=' + Date.now(), { cache: 'no-store', signal: control.signal });
            if (!r.ok) { return false; }
            const d = await r.json();
            return !!(d && d.estacion);
        } catch (_) {
            return false;
        } finally {
            clearTimeout(limite);
        }
    }

    function programar(segundos, fn) {
        clearTimeout(reloj);
        reloj = setTimeout(fn, segundos * 1000);
    }

    async function conectar() {
        clearTimeout(reloj);
        if (!actual) { mostrarAviso('Conectando con la estación…', '', false); }
        let url = '';
        try { url = await leerDireccion(); } catch (_) { url = ''; }

        if (url && await responde(url)) {
            fallosSeguidos = 0;
            if (esPanel) { location.replace(destino(url)); return; }
            if (url !== actual) {                         // primera vez o la radio cambió de túnel
                actual = url;
                marco.src = destino(url);
                marco.hidden = false;
                aviso.hidden = true;
            }
            programar(VIGILANCIA_SEG, conectar);
            return;
        }

        // Con el sitio ya abierto, un solo fallo puede ser un tropiezo de la red: se tolera uno.
        fallosSeguidos += 1;
        if (actual && fallosSeguidos < 2) { programar(15, conectar); return; }

        actual = '';
        marco.hidden = true;
        marco.removeAttribute('src');
        mostrarAviso('La estación está fuera de línea', 'La computadora de la radio está apagada o sin internet. Volvemos a intentar solos en '
            + REINTENTO_SEG + ' segundos.', true);
        programar(REINTENTO_SEG, conectar);
    }

    botonReintentar.addEventListener('click', conectar);
    conectar();
}());
