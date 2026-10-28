# Monetización

## Modelo vigente (piloto, sin cobro)

| Concepto | Valor | Dónde |
|---|---|---|
| Comisión al propietario | 15 % del alquiler | `BUSCADR_OWNER_FEE_BPS=1500` |
| Tarifa de servicio a quien alquila | 10 % del alquiler | `BUSCADR_RENTER_FEE_BPS=1000` |
| Garantía (depósito) | Fijada por el propietario; aparte, reembolsable | Ficha y reserva |
| Entrega a domicilio | Tarifa fija del propietario | Ficha y reserva |

Take rate efectivo: **25 % del alquiler**. Durante el piloto **no se cobra nada dentro de buscaDR**: la web muestra el total, el propietario ve cuánto recibiría y los KPIs calculan lo que buscaDR habría facturado. Los precios se muestran como «total estimado» para que quien alquila nunca descubra cargos al final.

## Unidad económica (panel `/admin`)

Contribución estimada por alquiler completado = comisiones − PSP (3,5 % + $0,25) − riesgo/daños (1 % del GMV) − soporte ($0,80). Supuestos del Documento Maestro §14; se ajustan en `server/routes/admin.ts` cuando haya datos reales. Los anuncios de muestra se excluyen de todos los KPIs.

## Palancas que ya habilita el código

1. **Destacados pagados** (CMS → Anuncios → «Destacado»): ya existe la posición y la etiqueta; falta solo cobrarlos.
2. **Entrega a domicilio** como servicio con margen (hoy la tarifa es 100 % del propietario).
3. **Referidos** (`referral_code` en cada cuenta) para créditos de primera reserva cuando haya pagos.
4. **Demanda no resuelta** (`demand_log`): qué buscan y no encuentran → captación dirigida de propietarios y, más adelante, flota propia o alianzas con ferreterías/rentadoras.
5. **Planes Pro para propietarios** (varias unidades, calendario, facturas): misma cuenta, rol con más límites.
6. **Protección/garantía opcional** con aseguradora local, solo tras el Go/No-Go y revisión legal.

## Antes de cobrar (Go/No-Go)

PSP local con split payments y retención de depósitos (p. ej. Kushki, Payphone, Datafast/Nuvei), facturación electrónica SRI, términos y política de privacidad revisados (LOPDP), proceso de disputas, verificación de identidad para propietarios con equipos de mayor valor. Nada de esto está activo hoy.
