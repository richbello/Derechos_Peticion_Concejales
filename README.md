# Concejales

Informes del Fondo de Desarrollo Local de Usme para responder derechos de petición del Concejo de Bogotá. Cada informe es un módulo que lee un reporte de BogData en el navegador; los archivos no se envían a ningún servidor.

## Cómo usarlo

Abra `index.html` en el navegador (doble clic) o publíquelo con GitHub Pages. La primera carga necesita internet para descargar el lector de Excel (SheetJS 0.18.5 y JSZip 3.10.1 desde cdnjs).

## Módulos

| Módulo | Carpeta | Entrada | Salida |
|---|---|---|---|
| Contratación por prestación de servicios | `modulos/contratacion-cps/` | Reporte CRP histórico (.xlsx) | Respuestas 4, 5 y 7 + Metodología + Detalle (.xlsx) |
| Obligaciones por pagar · Presupuestos participativos | `modulos/oxp-presupuestos-participativos/` | Matriz OXP + Reporte CRP histórico (.xlsx) | Matriz diligenciada con su formato + Detalle del cruce (.xlsx) |

### Contratación por prestación de servicios: reglas

1. **Valor comprometido:** columna Valor Neto (Valor CRP menos anulaciones).
2. **Vigencia:** año del No. Compromiso (`159-2021` o `159-20211` → 2021). Si no lo trae, año del contrato citado en el objeto (adiciones); si no, el ejercicio. Solo se acepta un año entre el ejercicio y dos años antes.
3. **Tipo:** columna H (Compromiso) cuando dice PROFESIONALES o APOYO A LA GESTION. Para el tipo genérico «CONTRATO DE PRESTACION DE SERVICIOS» (persona natural, contratación directa): código CPS-P / CPS-AG del objeto, tipo de otras filas del mismo contrato, palabras del objeto, u objeto igual a contratos de la columna H.
4. **Contratos:** cada número + año cuenta una vez con todas sus adiciones y toma el tipo de su CRP de mayor valor. No se cuentan los anulados.
5. Se excluyen las obligaciones por pagar (fondo `RB-`) para no contar dos veces el mismo compromiso.

### Obligaciones por pagar · Presupuestos participativos: reglas

En el Reporte CRP el mismo dinero aparece varias veces: el CRP de la vigencia (fondo VA) se registra otra vez al año siguiente como obligación por pagar (fondo RB), y lo que no se gira se registra de nuevo el año después. Por eso el módulo separa por fondo.

1. **Contrato:** número y año de la columna NÚMERO CONTRATO (`CIA 679 DE 2025` → 679-2025, `FDLU-SUM-1226-2024 (121505)` → 1226-2024). Sin año, se usa la vigencia de la iniciativa; con varios contratos en la celda, el primero. En el reporte, `657-20231` es el contrato 657-2023.
2. **Valor CRP y OXP constituida 31/12:** Valor CRP y Com. sin aut. giro de los registros VA del año del contrato.
3. **Giros OXP:** Autorización de giro de los registros RB.
4. **Liberación / fenecimiento:** anulaciones RB, más lo que quedó sin girar en el último año de reserva si ya cerró y no se volvió a registrar.
5. **Saldo:** fórmula de la plantilla (OXP − giros − liberación), comparada con lo pendiente de giro en el reporte.
6. **Salida:** la matriz se devuelve con su formato, tabla y listas desplegables; solo se reemplazan las celdas calculadas. No se tocan CDP, actas, causas, acciones ni soportes. Los valores son por contrato y se repiten en cada iniciativa.

## Estructura

```
Concejales/
├── index.html                      Portal con la lista de módulos
└── modulos/
    ├── contratacion-cps/
    │   ├── index.html              Interfaz del módulo
    │   ├── motor.js                Reglas de cálculo (sin interfaz)
    │   └── ejemplo.js              Resultado de ejemplo (CRP 13 nov 2026)
    └── oxp-presupuestos-participativos/
        ├── index.html              Interfaz del módulo
        └── motor.js                Cruce matriz OXP + CRP y escritura en la plantilla
```

## Agregar un módulo

1. Cree una carpeta en `modulos/` con su `index.html` y su `motor.js`.
2. Agregue la tarjeta del módulo en el `index.html` principal.
3. Anote el módulo en la tabla de este README.
