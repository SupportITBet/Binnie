// routes/testRoutes.js
import express from "express";
import supabase from "../config/supabase.js";
import { db } from "../config/firebase.js";

const router = express.Router();

router.get("/test", async (req, res) => {
  try {
    // Supabase test
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .limit(1);

    if (error) throw error;

    // Firebase test
    const snapshot = await db.collection("test").get();

    res.json({
      supabase: "✅ OK",
      firebase: "✅ OK",
      data,
      firebaseDocs: snapshot.size,
    });

  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

export default router;