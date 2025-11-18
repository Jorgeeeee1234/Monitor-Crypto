# Monitor Crypto · Frontend estático

Esta carpeta contiene los recursos estáticos (HTML, CSS y JavaScript) que componen la interfaz de la aplicación **Monitor Crypto**.  El frontend se comunica con los microservicios a través del API Gateway.

## Estructura

| Carpeta/archivo | Contenido |
|----------------|-----------|
| `pages/`       | Archivos HTML para cada vista (`login.html`, `register.html`, `principal.html`). |
| `css/`         | Hojas de estilo divididas por página (`login.css`, `register.css`, `principal.css`). |
| `js/`          | Scripts JavaScript para cada página.  Definen la lógica de interacción con la API (peticiones fetch, almacenamiento de tokens, manejo de formularios). |
| `images/`      | Recursos gráficos utilizados por el frontend. |

## Servir el frontend

Durante el desarrollo puedes abrir cualquier archivo HTML directamente con tu navegador, pero en producción se recomienda servir estos archivos con un servidor HTTP.  El `docker-compose.yml` en la raíz del proyecto incluye un contenedor Nginx que expone los archivos en `http://localhost:8080` y sirve de ejemplo de cómo desplegar el frontend junto al gateway y los microservicios.

## Comunicación con la API

Los scripts de este frontend asumen que el API Gateway está disponible en `http://localhost:5000`.  Si cambias el puerto o despliegas la aplicación en otro entorno, ajusta las constantes `API_BASE`, `NODE_API`, etc., en los ficheros de JavaScript ubicados en `js/`.

## Desarrollo

Para realizar cambios en los estilos o en la lógica de las páginas, edita los archivos correspondientes dentro de `css/` y `js/`.  Recuerda que cualquier modificación en los endpoints de la API debe reflejarse en estos scripts para que las llamadas sigan funcionando correctamente.