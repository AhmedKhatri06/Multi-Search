import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

export const multiSearch = async (query) => {
  const res = await axios.post(`${API_URL}/api/multi-search`, { query });
  return res.data;
};
