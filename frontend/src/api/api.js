import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const lookUpSearch = async (query) => {
  const res = await axios.post(`${API_URL}/api/lookup/identify`, { query });
  return res.data;
};
