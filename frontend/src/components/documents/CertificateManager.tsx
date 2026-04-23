// Componente de gestión de certificados PDF para un arqueo
import { useEffect, useRef, useState } from 'react';
import documentService, { Certificate } from '@/services/documentService';

const MAX_SIZE_MB = 10;
const MAX_CERTIFICATES = 10;

interface Props {
  headerId: number;
  readOnly?: boolean;
}

export default function CertificateManager({ headerId, readOnly = false }: Props) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const certs = await documentService.listCertificates(headerId);
      setCertificates(certs);
    } catch {
      setError('Error al cargar los certificados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [headerId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validaciones cliente
    if (file.type !== 'application/pdf') {
      setError('Solo se permiten archivos PDF.');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`El archivo excede el límite de ${MAX_SIZE_MB} MB.`);
      return;
    }
    if (certificates.length >= MAX_CERTIFICATES) {
      setError(`Se alcanzó el máximo de ${MAX_CERTIFICATES} certificados.`);
      return;
    }

    setError('');
    setUploading(true);
    try {
      await documentService.uploadCertificate(headerId, file);
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e?.response?.data?.detail || 'Error al subir el archivo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (cert: Certificate) => {
    try {
      const url = await documentService.getDownloadUrl(cert.id);
      window.open(url, '_blank');
    } catch {
      setError('Error al generar el enlace de descarga.');
    }
  };

  const handleDelete = async (cert: Certificate) => {
    if (!confirm(`¿Eliminar el certificado "${cert.file_name}"?`)) return;
    try {
      await documentService.deleteCertificate(cert.id);
      await load();
    } catch {
      setError('Error al eliminar el certificado.');
    }
  };

  const formatSize = (bytes: number | null): string => {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-muted text-sm py-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
        Cargando certificados...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm text-text-primary">
          Certificados PDF
          <span className="ml-2 text-xs text-text-muted font-normal">
            ({certificates.length}/{MAX_CERTIFICATES})
          </span>
        </h3>
        {!readOnly && certificates.length < MAX_CERTIFICATES && (
          <label className="btn btn-outline text-xs cursor-pointer">
            {uploading ? 'Subiendo...' : '+ Subir PDF'}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {error && (
        <p className="text-error text-xs">{error}</p>
      )}

      {certificates.length === 0 ? (
        <p className="text-xs text-text-muted">Sin certificados adjuntos.</p>
      ) : (
        <div className="space-y-1">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="flex items-center justify-between px-3 py-2 bg-surface rounded border border-border text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-error text-lg leading-none">📄</span>
                <div className="min-w-0">
                  <p className="text-text-primary truncate text-xs font-medium">
                    {cert.file_name}
                  </p>
                  <p className="text-text-muted text-xs">
                    {formatSize(cert.file_size_bytes)} ·{' '}
                    {new Date(cert.uploaded_at).toLocaleString('es-MX', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0 ml-3">
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => handleDownload(cert)}
                >
                  Descargar
                </button>
                {!readOnly && (
                  <button
                    className="text-xs text-error hover:underline"
                    onClick={() => handleDelete(cert)}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
