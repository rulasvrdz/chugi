# Chugi — Brief de producto v1 (piloto)

Oct 27, 2026 · @Raul Verduzco

## Problema

Los restaurantes no saben quién regresa ni tienen una forma simple de hacer que regrese. Hoy tienen tres caminos y los tres fallan:

- **Tarjetas de cartón:** se pierden, se falsifican y no dejan ningún dato.
- **Apps de lealtad:** nadie descarga una app para un solo restaurante.
- **Reseñas en Google:** pedirlas es incómodo, y las herramientas que las "impulsan" con premios o filtros ponen en riesgo el perfil del negocio.

Chugi convierte cada visita en un sello digital con un tap al celular, sin descargar nada, y le da al dueño datos reales de recurrencia.

## Usuarios

| Usuario | Quién es | Qué necesita de Chugi |
| --- | --- | --- |
| Cliente | Comensal del restaurante, con celular | Sumar sellos sin descargar nada y cobrar su premio sin fricción |
| Dueño o gerente | Quien decide y paga | Configurar premio y promociones, y ver quién regresa |
| Staff de caja | Mesero o cajero | Validar canjes en segundos, sin trabajo extra en hora pico |

## Flujo principal

&#91;embedded content: Flujo del cliente · del tap al premio\]

La primera vez el cliente se registra; desde la segunda visita, el tap suma el sello directo. El dueño define N, el premio y las promociones desde el panel.

## Alcance v1

El piloto corre con 1 restaurante, solo en web + Apple/Google Wallet, sin app nativa. La ruta crítica es registro → sello → recompensa.

| Prioridad | Feature | Módulo |
| --- | --- | --- |
| Must | Registro de visita con sello NFC, con o sin app instalada | Stamp |
| Must | Registro de clientes con celular + código | Pass |
| Must | Tarjeta de sellos en Apple/Google Wallet | Pass |
| Must | Recompensa al acumular N visitas, configurable en el panel y validada por el staff | Rewards + Business |
| Must | Plataforma multi-negocio (operando con 1) | Fundaciones |
| Should | Placa física 3D que abre directo la reseña en Google | Reviews |
| Should | Banner de promociones administrado desde el panel | Promociones + Business |
| Could | Aviso de cercanía al negocio a través del pase de Wallet | Promociones |
| Could | Carta digital editable por el restaurante, con pedido armado por WhatsApp (sin pagos) | Menú |

**Reglas del piloto:**

- Máximo 1 sello por cliente por día.
- Cada tap genera un link de un solo uso; un link copiado o una foto del sello no suman.
- El premio se canjea con un código que valida el staff en caja.
- El restaurante se da de alta por nosotros; no hay registro de negocios por autoservicio.

## Fuera de alcance

- **App nativa:** llega cuando el producto ya tenga tracción.
- **Premios o sellos a cambio de reseñas**, y cualquier filtro por calificación: Google lo prohíbe.
- **Pagos en línea** en los pedidos por WhatsApp.
- **Notificaciones propias basadas en la ubicación del cliente:** solo usamos las de Wallet, así que nunca recibimos su ubicación.
- **Alta de negocios por autoservicio** y operación con más de un restaurante.

## Por qué Chugi

1. **El sello que no se puede falsificar.** Las tarjetas de cartón se falsifican y los QR se fotografían. El sello de Chugi genera un link de un solo uso en cada tap, así que el dueño premia a clientes reales.
2. **Cero descargas.** Un tap, el celular y la tarjeta queda en el Wallet en segundos. Sin "baja la app", que es donde mueren casi todos los programas de lealtad.
3. **Reseñas limpias.** Muchas herramientas filtran clientes molestos o regalan cosas por reseñar, y eso arriesga el perfil de Google del negocio. Chugi cumple las políticas: el dueño gana reseñas sin arriesgar las que ya tiene.
4. **Privacidad como argumento de venta.** No rastreamos la ubicación del cliente, pedimos el mínimo de datos y cumplimos la LFPDPPP desde el diseño.
5. **Hecho para cómo vende un negocio en México.** Lealtad, reseñas, promociones y pedidos por WhatsApp en un solo lugar.

## Métricas de éxito del piloto

El piloto es un éxito si los clientes se registran sin fricción, regresan y el dueño decide seguir. Las metas son una propuesta inicial, a ajustar con el restaurante cuando conozcamos su volumen de clientes.

| Métrica | Qué valida | Meta propuesta |
| --- | --- | --- |
| Clientes que completan el registro tras su primer tap | Adopción del cliente | 60% o más |
| Tiempo del primer registro en caja | Que el staff no lo abandone | Menos de 30 segundos |
| Registrados que guardan la tarjeta en Wallet | Retención de la tarjeta | 50% o más |
| Registrados con 2 o más visitas en 30 días | Recurrencia | 30% o más |
| Recompensas canjeadas y validadas en caja | Ciclo completo funcionando | 10 o más |
| Sellos duplicados o fraudulentos aceptados | Antifraude | 0 |
| Reseñas nuevas en Google vs. el mismo periodo anterior | Valor visible para el dueño | Aumento |
| El dueño decide continuar al terminar | Adopción del restaurante | Sí |

**Pendiente:** definir la duración del piloto con el restaurante.

## Riesgos y pendientes

| Riesgo | Dónde pega | Cómo lo cubrimos |
| --- | --- | --- |
| Fraude o sellos duplicados | Sello NFC, recompensa | Link de un solo uso por tap, 1 sello por día y canje validado por el staff |
| Privacidad (LFPDPPP) | Registro, Wallet, pedidos por WhatsApp | Datos mínimos, aviso de privacidad claro y sin rastreo de ubicación; el pedido por WhatsApp revela el número al restaurante y se informa |
| Adopción del restaurante | Registro en caja, reseñas, promociones | Registro de menos de 30 segundos y beneficios visibles para el dueño desde el día 1 |

- [ ] Iniciar los trámites de Apple Wallet (cuenta de desarrollador) y Google Wallet (aprobación como emisor). Es tiempo de espera, no código.
- [ ] Redactar el aviso de privacidad.
- [ ] Acordar con el restaurante la duración del piloto.

**Estacionamiento v2** (ideas, no compromisos):

- Resumen semanal para el dueño por WhatsApp.
- Referidos: un cliente invita a un amigo y ambos ganan un sello.
- App nativa y alta de negocios por autoservicio.
