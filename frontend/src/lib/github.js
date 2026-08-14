import api from "@/lib/api";

export async function connectGithub(payload) {
  const { data } = await api.post("/github/connect", payload);
  return data;
}

export async function getGithubReviews(params = {}) {
  const { data } = await api.get("/github/reviews", { params });
  return data;
}
