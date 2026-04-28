// Modal genérico para carga masiva CSV con preview de errores antes de aplicar
import { useRef, useState } from 'react';
import { Upload, Download, X, CheckCircle2, AlertCircle } from 'lucide-react';

import api, { getErrorMessage } from '@/services/api';

interface BulkImportItem {
  row: number;
  status: 'ok' | 'error' | 'created';
  errors?: string[];
  [k: string]: unknown;
}

interface PreviewResponse {
  format_errors?: string[];
  items: BulkImportItem[];
  valid: number;
  invalid: number;
}

interface ApplyResponse {
  applied: boolean;
  created: number;
  failed: number;
  results: BulkImportItem[];
  format_errors?: string[];
  message?: string;
}

interface Props {
  title: string;
  endpoint: string; // p.ej. "/users/bulk-import" o "/vaults/bulk-import"
  templateFilename: string;
  /** Devuelve las columnas a mostrar en la tabla de preview por cada item. */
  renderRowSummary: (item: BulkImportItem) => React.ReactNode;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function BulkImportModal({
  title,
  endpoint,
  templateFilename,
  renderRowSummary,
  onClose,
  onSuccess,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = async () => {
    setError('');
    try {
      const response = await api.get(`${endpoint}/template`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', templateFilename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setApplyResult(null);
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const { data } = await api.post<PreviewResponse>(`${endpoint}/preview`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(data);
    } catch (err) {
      setError(getErrorMessage(err));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!file) return;
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<ApplyResponse>(`${endpoint}/apply`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setApplyResult(data);
      if (data.applied && data.created > 0 && onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setApplyResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {!preview && !applyResult && (
            <>
              <p className="text-sm text-text-secondary">
                Sube un archivo CSV. Primero te mostramos un preview para que revises
                errores antes de aplicar los cambios.
              </p>
              <div className="flex gap-3 items-center">
                <button
                  onClick={downloadTemplate}
                  className="btn btn-outline text-sm flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Descargar plantilla
                </button>
                <label className="btn btn-primary text-sm flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Seleccionar CSV
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                </label>
                {file && <span className="text-xs text-text-muted">{file.name}</span>}
              </div>
            </>
          )}

          {error && (
            <div className="p-3 bg-error/10 border border-error rounded text-error text-sm">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-20">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          )}

          {preview && !applyResult && (
            <div className="space-y-3">
              {preview.format_errors && preview.format_errors.length > 0 && (
                <div className="p-3 bg-error/10 border border-error rounded text-error text-sm">
                  <p className="font-medium mb-1">Errores de formato:</p>
                  <ul className="list-disc list-inside">
                    {preview.format_errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex gap-4 text-sm">
                <span className="badge-success">
                  <CheckCircle2 className="w-3 h-3 inline mr-1" />
                  {preview.valid} válidas
                </span>
                {preview.invalid > 0 && (
                  <span className="badge-error">
                    <AlertCircle className="w-3 h-3 inline mr-1" />
                    {preview.invalid} con error
                  </span>
                )}
              </div>

              {preview.items.length > 0 && (
                <div className="border border-border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-surface border-b border-border">
                      <tr className="text-left text-text-muted">
                        <th className="px-3 py-1.5 w-12">Fila</th>
                        <th className="px-3 py-1.5">Datos</th>
                        <th className="px-3 py-1.5 w-16">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.items.map((item) => (
                        <tr
                          key={item.row}
                          className={`border-b border-border/30 ${
                            item.status === 'error' ? 'bg-error/5' : ''
                          }`}
                        >
                          <td className="px-3 py-1.5 font-mono">{item.row}</td>
                          <td className="px-3 py-1.5">
                            {renderRowSummary(item)}
                            {item.errors && item.errors.length > 0 && (
                              <ul className="mt-1 text-error text-[11px] list-disc list-inside">
                                {item.errors.map((e, i) => <li key={i}>{e}</li>)}
                              </ul>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {item.status === 'ok' ? (
                              <CheckCircle2 className="w-4 h-4 text-success" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-error" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={reset} className="btn btn-secondary text-sm">
                  Cargar otro archivo
                </button>
                <button
                  onClick={handleApply}
                  disabled={preview.invalid > 0 || preview.valid === 0}
                  className="btn btn-primary text-sm flex-1"
                  title={
                    preview.invalid > 0
                      ? 'Corrige los errores antes de aplicar'
                      : ''
                  }
                >
                  Aplicar import ({preview.valid} {preview.valid === 1 ? 'fila' : 'filas'})
                </button>
              </div>
            </div>
          )}

          {applyResult && (
            <div className="space-y-3">
              {applyResult.applied ? (
                <div className="p-3 bg-success/10 border border-success rounded text-sm">
                  <p className="font-medium text-success">
                    ✓ {applyResult.created} {applyResult.created === 1 ? 'registro creado' : 'registros creados'}
                  </p>
                  {applyResult.failed > 0 && (
                    <p className="text-error mt-1">
                      ⚠ {applyResult.failed} fallaron — revisa la lista
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-error/10 border border-error rounded text-sm">
                  <p className="font-medium text-error">
                    No se aplicó nada: {applyResult.message ?? 'hay errores en el archivo.'}
                  </p>
                </div>
              )}

              {applyResult.results.length > 0 && (
                <div className="border border-border rounded overflow-hidden max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {applyResult.results.map((item) => (
                        <tr
                          key={item.row}
                          className={`border-b border-border/30 ${
                            item.status === 'error' ? 'bg-error/5' : 'bg-success/5'
                          }`}
                        >
                          <td className="px-3 py-1.5 font-mono w-12">{item.row}</td>
                          <td className="px-3 py-1.5">
                            {renderRowSummary(item)}
                            {item.errors && item.errors.length > 0 && (
                              <ul className="mt-1 text-error text-[11px] list-disc list-inside">
                                {item.errors.map((e, i) => <li key={i}>{e}</li>)}
                              </ul>
                            )}
                          </td>
                          <td className="px-3 py-1.5 w-20 text-right">
                            {item.status === 'created' && (
                              <span className="text-success text-[11px]">Creado</span>
                            )}
                            {item.status === 'error' && (
                              <span className="text-error text-[11px]">Error</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={reset} className="btn btn-outline text-sm">
                  Cargar otro archivo
                </button>
                <button onClick={onClose} className="btn btn-primary text-sm flex-1">
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
