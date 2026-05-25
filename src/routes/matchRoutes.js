import express from "express";
import {
    getMatches,
    getMatchById,
    getRounds,
    getStandings,
    refreshCache,
} from "../controllers/matchController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getMatches);
router.get("/rounds", getRounds);
router.get("/standings", getStandings);
router.post("/refresh-cache", authMiddleware, refreshCache);
router.get("/:fixtureId", getMatchById);

export default router;
