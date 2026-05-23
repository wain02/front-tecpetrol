export type WellAnalysisRecord = {
  pad_id: string;
  pozo_id: string;
  timestamp: string;
  presion_boca_psi: number | null;
  presion_anular_psi: number | null;
  esta_abierto?: number;
  evento_apertura?: number;
  evento_cierre?: number;
  cambio_orificio?: number;
  purga_anular?: number;
  orificio_mm?: number | null;
  ratio_anular_vs_hidro?: number | null;
  P_hidro_boca_psi?: number | null;
};

export type ExtrapolationEvent = {
  pozo_id: string;
  pad_id: string;
  timestamp_evento: string;
  tipo_evento: string;
  N_puntos: number;
  tp_horas: number | null;
  t_rel: number[];
  p_obs: number[];
  params_exp: { P_estable: number; A: number; k: number } | null;
  P_estimada_exp: number | null;
  R2_exp: number | null;
  a_slog: number | null;
  b_slog: number | null;
  P_estimada_semilog: number | null;
  R2_semilog: number | null;
  P_estrella_horner: number | null;
  m_horner: number | null;
  R2_horner: number | null;
  P_primer_dato: number;
  delta_vs_primer_dato_exp: number | null;
  delta_vs_primer_dato_semilog: number | null;
};

export type DensidadColumnaRecord = {
  pad_id: string;
  pozo_id: string;
  timestamp: string;
  presion_boca_psi: number;
  presion_fondo_psia: number;
  fecha_medicion_fondo: string;
  horas_al_dato_fondo: number;
  profundidad_tvd_m: number;
  delta_P_psi: number;
  densidad_columna_kg_l: number | null;
  interpretacion: string;
  dato_fondo_lejano: boolean;
};
