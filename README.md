# Concejales

Informes del Fondo de Desarrollo Local de Usme para responder derechos de petición del Concejo de Bogotá. Cada informe es un módulo que lee un reporte de BogData en el navegador; los archivos no se envían a ningún servidor.

## Cómo usarlo

Abra `index.html` en el navegador (doble clic) o publíquelo con GitHub Pages. La primera carga necesita internet para descargar el lector de Excel (SheetJS 0.18.5 desde cdnjs).

## Módulos

| Módulo | Carpeta | Entrada | Salida |
|---|---|---|---|
| Contratación por prestación de servicios | `modulos/contratacion-cps/` | Reporte CRP histórico (.xlsx) | Respuestas 4, 5 y 7 + Metodología + Detalle (.xlsx) |

### Contratación por prestación de servicios: reglas

1. **Valor comprometido:** columna Valor Neto (Valor CRP menos anulaciones).
2. **Vigencia:** año del No. Compromiso (`159-2021` o `159-20211` → 2021). Si no lo trae, año del contrato citado en el objeto (adiciones); si no, el ejercicio. Solo se acepta un año entre el ejercicio y dos años antes.
3. **Tipo:** columna H (Compromiso) cuando dice PROFESIONALES o APOYO A LA GESTION. Para el tipo genérico «CONTRATO DE PRESTACION DE SERVICIOS» (persona natural, contratación directa): código CPS-P / CPS-AG del objeto, tipo de otras filas del mismo contrato, palabras del objeto, u objeto igual a contratos de la columna H.
4. **Contratos:** cada número + año cuenta una vez con todas sus adiciones y toma el tipo de su CRP de mayor valor. No se cuentan los anulados.
5. Se excluyen las obligaciones por pagar (fondo `RB-`) para no contar dos veces el mismo compromiso.

## Estructura

```
Concejales/
├── index.html                      Portal con la lista de módulos
└── modulos/
    └── contratacion-cps/
        ├── index.html              Interfaz del módulo
        ├── motor.js                Reglas de cálculo (sin interfaz)
        └── ejemplo.js              Resultado de ejemplo (CRP 13 nov 2026)
```

## Agregar un módulo

1. Cree una carpeta en `modulos/` con su `index.html` y su `motor.js`.
2. Agregue la tarjeta del módulo en el `index.html` principal.
3. Anote el módulo en la tabla de este README.
