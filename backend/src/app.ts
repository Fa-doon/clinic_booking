import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRoutes from "./routes/index.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Clinic Booking API is running" });
});

app.use(apiRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});