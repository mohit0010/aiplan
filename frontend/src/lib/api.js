import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API_BASE });

export async function uploadPlan(file, onProgress) {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post("/analyze", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
    timeout: 180000,
  });
  return res.data;
}

export async function getAnalysis(id) {
  const res = await api.get(`/analysis/${id}`);
  return res.data;
}

export async function updateAnalysis(id, payload) {
  const res = await api.put(`/analysis/${id}`, payload);
  return res.data;
}

export async function listAnalyses() {
  const res = await api.get(`/analyses`);
  return res.data;
}

export async function deleteAnalysis(id) {
  const res = await api.delete(`/analysis/${id}`);
  return res.data;
}

export function previewUrl(id) {
  return `${API_BASE}/analysis/${id}/preview`;
}

export function reportUrl(id) {
  return `${API_BASE}/analysis/${id}/report`;
}
