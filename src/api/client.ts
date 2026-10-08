export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: globalThis.Response;
  try {
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(`No se pudo conectar con Brújula API en ${API_BASE_URL}. Revisa la configuración de red.`, 0);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join('\n') : payload?.message;
    throw new ApiError(typeof message === 'string' ? message : 'Ocurrió un error al comunicarse con el servidor.', response.status);
  }
  return payload as T;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}
