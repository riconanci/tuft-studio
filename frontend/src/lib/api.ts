import type { ProcessRequest, ProcessResponse, PreviewResponse, AnalyzeResponse } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 60000
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Request timed out — the server may be warming up. Try again.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async processImage(request: ProcessRequest): Promise<ProcessResponse> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/process`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
      90000 // 90s for full processing
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Processing failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async previewImage(
    image: string,
    paletteSize: number,
    useYarnPalette: boolean
  ): Promise<PreviewResponse> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, paletteSize, useYarnPalette }),
      },
      15000 // 15s for preview
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Preview failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async analyzeColors(
    image: string,
    useYarnPalette: boolean
  ): Promise<AnalyzeResponse> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/analyze`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, useYarnPalette }),
      },
      20000 // 20s for analysis
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Analysis failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const api = new ApiClient(API_URL);
