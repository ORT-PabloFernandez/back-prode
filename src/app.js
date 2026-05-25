import express from "express";
import morgan from "morgan";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import predictionRoutes from "./routes/predictionRoutes.js";

const app = express();

// Middlewares
app.use(morgan("dev"));
app.use(cors());
app.use(express.json());

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/predictions", predictionRoutes);

// Ruta base
app.get("/", (req, res) => {
    res.send("Prode API 🏆");
});

// 404
app.use((req, res) => {
    res.status(404).json({ message: "Ruta no encontrada" });
});

// Error handler global
app.use((err, req, res, next) => {
    const status = err.status || 500;
    const message = err.message || "Error interno del servidor";
    res.status(status).json({ message });
});

export default app;
