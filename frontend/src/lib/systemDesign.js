import api from "@/lib/api";

export async function evaluateDiagram(payload) {
  const { data } = await api.post("/api/evaluate-diagram", payload);
  return data;
}
