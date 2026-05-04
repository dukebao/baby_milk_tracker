const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export async function apiRequest(path, { token, babyId, method = "GET", body } = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (babyId) {
    headers["X-Baby-Id"] = String(babyId);
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || "Request failed");
  }

  return data;
}
