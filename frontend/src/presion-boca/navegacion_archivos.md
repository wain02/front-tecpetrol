```
frontend/src/presion-boca/
  types.ts                 ← WellAnalysisRecord, ExtrapolationEvent
  api.ts                   ← buildApiUrl, fetchJson, postJson
  utils.ts                 ← cx, formatEventDate, formatDT, WELL_COLORS, downloadSvg
  OverlayChart.tsx         ← gráfico overlay de todos los pozos del PAD
  WellDetailChart.tsx      ← gráfico detalle de un pozo con eventos
  ExtrapolationTable.tsx   ← tabla de métricas por evento
  EventFitChart.tsx        ← gráfico interactivo de ajuste (con exclusión de puntos)
  index.tsx                ← PresionBocaAnalysis, el componente raíz que orquesta todo
  DensidadColumnaPanel.tsx ← Grafico de evolucion de la densidad
  GorEvolutionPanel.tsx    ← Grafico de evolucion de relacion liquido-gas de todo el PAD
```