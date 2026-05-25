import "dotenv/config";
import app from "./src/app.js";
import { connectToDatabase } from "./src/data/connection.js";

const PORT = process.env.PORT || 3000;

connectToDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error("No se pudo iniciar el servidor:", error.message);
        process.exit(1);
    });
