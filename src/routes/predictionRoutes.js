import express from "express";
import {
    upsertPredictionHandler,
    getMyPredictions,
    getPredictionByFixture,
    deletePredictionHandler,
    getRanking,
} from "../controllers/predictionController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/", upsertPredictionHandler);
router.get("/", getMyPredictions);
router.get("/ranking", getRanking);
router.get("/:fixtureId", getPredictionByFixture);
router.delete("/:fixtureId", deletePredictionHandler);

export default router;
