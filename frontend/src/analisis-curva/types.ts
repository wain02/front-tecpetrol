export type FirmaRecord = {
  pad_id: string;
  pozo_id: string;
  t_inicio: string;
  t_fin: string;
  tipo_segmento: string;
  cluster: number;
  duracion_horas: number;
  p_media: number;
  p_std: number;
  p_rango: number;
  p_cv: number;
  delta_total: number;
  tasa_cambio_media: number;
  pendiente_inicial: number;
  pendiente_final: number;
  ratio_pendientes: number;
  r2_lineal: number;
  r2_exponencial: number;
  n_picos_total: number;
  n_oscilaciones: number;
  derivada_max_abs: number;
  derivada_media_abs: number;
  delta_anular_boca_medio: number;
  delta_anular_boca_std: number;
  tiempo_estabilizacion_horas: number;
};

export type CicloResumen = {
  pad_id: string;
  pozo_id: string;
  timestamp_apertura: string;
  timestamp_cierre: string;
  n_registros: number;
  P0: number;
  P_final: number;
  delta_P: number;
  orificio_apertura: number | null;
};

export type SeriePoint = {
  timestamp: string;
  presion_boca_psi: number;
  presion_anular_psi?: number | null;
  orificio_mm?: number | null;
  temperatura_boca_c?: number | null;
  esta_abierto?: 0 | 1 | null;
};

export type FeaturesEtapa1 = {
  n_registros: number;
  pendiente_inicial: number;
  aceleracion: number;
  rango_presion: number;
  volatilidad: number;
  p_min: number;
  p_max: number;
};

export type FeaturesResto = {
  n_registros: number;
  p_promedio: number;
  p_std: number;
  pct_tiempo_bajo_p0: number;
  n_cruces_p0: number;
};

export type CicloDetalle = CicloResumen & {
  n_etapa1: number;
  serie_temporal: SeriePoint[];
  features_etapa1: FeaturesEtapa1;
  features_resto: FeaturesResto;
};

export type CurvePoint = {
  t_norm: number;
  p_delta_psi: number;
};

export type CompareCurve = {
  pad_id: string;
  pozo_id: string;
  timestamp_apertura: string;
  timestamp_cierre: string;
  P0: number;
  n_registros: number;
  curva: CurvePoint[];
  error?: string;
};

export type CicloRef = {
  pad_id: string;
  pozo_id: string;
  timestamp_apertura: string;
  timestamp_cierre: string;
};
