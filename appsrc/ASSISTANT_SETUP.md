# Asistente FVMarket

La ayuda del catálogo funciona sin credenciales ni servicios de pago desde el botón **Ayuda** de la tienda. Usa exclusivamente productos publicados, precios vigentes de la cuenta, políticas existentes y pedidos del cliente autenticado. No modifica pedidos ni realiza compras.

## Activación de la IA gratuita

El proveedor preparado es Cloudflare Workers AI, modelo `@cf/meta/llama-3.2-3b-instruct`. Crear o conectar una cuenta **Workers Free**, sin contratar Workers Paid ni añadir créditos de AI Gateway. La cuenta y sus condiciones deben aceptarlas el titular.

Desde Cloudflare → Workers AI → Use REST API, obtener el Account ID y crear el token específico Workers AI. Instrucciones oficiales: https://developers.cloudflare.com/workers-ai/get-started/rest-api/

Configurar estas variables secretas en Render → fvmarket-app → Environment, sin incluirlas en el repositorio ni compartir el token en el chat:

- `CLOUDFLARE_ACCOUNT_ID`: identificador de 32 caracteres de la cuenta.
- `CLOUDFLARE_AI_TOKEN`: token limitado a Workers AI.
- `FVM_ASSISTANT_FREE_PLAN_CONFIRMED`: `true`, únicamente después de comprobar que la cuenta usa Workers Free.
- `FVM_ASSISTANT_AI_ENABLED`: `true`.

Desplegar. `/api/assistant/status` indica `aiConfigured: true` cuando esas variables están presentes. Esto indica configuración, no prueba que el token sea válido. Una pregunta sobre una referencia publicada debe devolver `mode: ai` cuando el proveedor funciona. No marcar la activación como completada sin verificar esa respuesta real.

## Límites y privacidad

Workers Free aplica actualmente un límite de 10.000 neuronas diarias, según https://developers.cloudflare.com/workers-ai/platform/pricing/ . La cantidad de preguntas depende del consumo de cada una; esa cuota no equivale a 10.000 consultas. Mantener el plan gratuito: los límites locales no garantizan evitar cargos si se contrata un plan de pago o se utiliza la cuenta desde otros servicios.

El servidor admite hasta 100 llamadas IA por día UTC y proceso, dos concurrentes, 256 tokens de salida y 20 preguntas por visitante en diez minutos. Espera hasta 20 segundos al proveedor; la interfaz cancela una consulta tras 30 segundos. La conexión HTTPS utiliza IPv4, mantiene la validación del certificado y no sigue redirecciones ni proxies externos. Los contadores locales se reinician al reiniciar el proceso; el límite del proveedor persiste. Un error del proveedor devuelve automáticamente la ayuda local, sin recurrir a ninguna API de pago. El diagnóstico registra solo el tipo de fallo, estado HTTP, códigos numéricos del proveedor y códigos conocidos de conexión, sin su mensaje de error ni el contenido de la consulta. Si la IA está habilitada con una configuración inválida, al arrancar registra únicamente los nombres de los ajustes que fallan; nunca sus valores. Este diagnóstico no se expone en el estado público del asistente.

La IA recibe solamente la pregunta general y título, referencia y descripción públicos de los artículos pertinentes. No recibe datos de la cuenta, pedidos, facturas, precios personalizados, costes de compra ni proveedores internos. Las consultas con patrones de información personal se resuelven localmente; esa detección no garantiza reconocer todos los datos, por lo que se pide al cliente no introducirlos. Los mensajes no se guardan ni en la base de datos ni en almacenamiento del navegador; se borran al cerrar la conversación o cambiar de sesión. No se registran prompts ni respuestas en los logs de la aplicación. La política de privacidad identifica a Cloudflare cuando se activa el proveedor. Verificar el acuerdo de tratamiento y las garantías de transferencias aplicables antes de activar la IA.

La interfaz distingue las respuestas de IA de la ayuda local. Los precios, descuentos, plazos, devoluciones y estados de pedidos siempre se calculan o consultan en FVMarket. Los contenidos devueltos se representan como texto, con enlaces y acciones seleccionados por el servidor, y ninguna salida de IA puede ejecutar acciones.
