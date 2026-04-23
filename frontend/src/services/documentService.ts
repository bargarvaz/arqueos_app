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

  getDownloadUrl: async (certificate_id: number): Promise<string> => {
    const { data } = await api.get(
      `/documents/certificates/${certificate_id}/download`
    );
    return data.download_url;
  },

  deleteCertificate: async (certificate_id: number): Promise<void> => {
    await api.delete(`/documents/certificates/${certificate_id}`);
  },
};

export default documentService;
