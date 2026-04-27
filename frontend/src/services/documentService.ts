// Servicio de certificados PDF
import api from './api';

export interface Certificate {
  id: number;
  arqueo_header_id: number;
  file_name: string;
  minio_bucket: string;
  minio_key: string;
  file_size_bytes: number | null;
  content_type: string;
  is_active: boolean;
  uploaded_by: number;
  uploaded_at: string;
}

const documentService = {
  listCertificates: async (header_id: number): Promise<Certificate[]> => {
    const { data } = await api.get(`/documents/arqueos/${header_id}/certificates`);
    return data;
  },

  uploadCertificate: async (
    header_id: number,
    file: File
  ): Promise<Certificate> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post(
      `/documents/arqueos/${header_id}/certificates`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },

  /**
   * Descarga el PDF a través del backend (que hace stream desde MinIO).
   * Antes usábamos URL pre-firmada de MinIO directa, pero su host (`minio:9000`)
   * no es resoluble desde el browser.
   *
   * @param mode 'download' fuerza descarga; 'view' abre en nueva pestaña.
   */
  downloadCertificate: async (
    certificate_id: number,
    suggested_name: string,
    mode: 'download' | 'view' = 'download',
  ): Promise<void> => {
    const response = await api.get(
      `/documents/certificates/${certificate_id}/download`,
      { responseType: 'blob' },
    );
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    if (mode === 'view') {
      window.open(url, '_blank', 'noopener');
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      return;
    }
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', suggested_name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  deleteCertificate: async (certificate_id: number): Promise<void> => {
    await api.delete(`/documents/certificates/${certificate_id}`);
  },
};

export default documentService;
