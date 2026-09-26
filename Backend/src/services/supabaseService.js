// src/services/supabaseService.js

import supabase from "../config/supabase.js";

export const getStudents = async () => {
  return await supabase.from("apprenants").select("*");
};