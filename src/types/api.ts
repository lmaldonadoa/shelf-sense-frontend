export type UploadItem = {
  file_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  public_url: string | null;
};

export type UploadResponse = {
  uploaded: UploadItem[];
};

export type CreateJobRequest = {
  account_name: string;
  config_name?: string;
  image_file_ids?: string[];
  image_paths?: string[];
  id_pdv: string;
  subcategoria: string;
  usuario_relevo?: string | null;
  db_excel?: string | null;
  output_name?: string | null;
  skip_qwen?: boolean | null;
  cadena?: string | null;
  export_excel?: boolean | null;
};

export type CreateJobResponse = {
  job_id: string;
  message?: string;
};

export type Detection = {
  label: string;
  conf: number;
  box: [number, number, number, number];
};

export type JobImage = {
  image_name: string;
  status: string;
  file_id?: string | null;
  original_name?: string | null;
  annotated_image_path?: string | null;
  detections?: Detection[];
  detections_count?: number;
  error?: string | null;
};

export type JobResponse = {
  job_id: string;
  status: string;
  total_images?: number;
  processed_images?: number;
  failed_images?: number;
  progress?: number;
  created_at?: string;
  updated_at?: string;
  error?: string;
  images: JobImage[];
};

export type JobEvent = {
  id?: string | number;
  timestamp?: string;
  type?: string;
  level?: string;
  message?: string;
  details?: unknown;
};

export type JobEventsResponse = JobEvent[];

export type JobResultsResponse = {
  job_id?: string;
  summary?: Record<string, unknown>;
  products?: Record<string, unknown>[];
  extracted_products?: Record<string, unknown>[];
  user_response?: {
    id_pdv?: string;
    subcategoria?: string;
    usuario_relevo?: string | null;
    productos?: Record<string, unknown>[];
  };
  images: JobImage[];
};

export type AccountConfig = {
  id: string | number;
  account_name: string;
  name: string;
  version: string;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type CreateAccountConfigRequest = {
  name: string;
  version: string;
  is_active: boolean;
  config: Record<string, unknown>;
};
