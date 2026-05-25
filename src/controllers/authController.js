import jwt from "jsonwebtoken";
import { registerService, loginService } from "../services/authService.js";

export async function register(req, res, next) {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: "name, email y password son requeridos" });
    }

    try {
        const result = await registerService({ name, email, password });
        res.status(201).json({ message: "Usuario registrado exitosamente", userId: result.insertedId });
    } catch (error) {
        next(error);
    }
}

export async function login(req, res, next) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "email y password son requeridos" });
    }

    try {
        const user = await loginService(email, password);
        const token = jwt.sign(
            { _id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );
        res.json({ message: "Login exitoso", user, token });
    } catch (error) {
        next(error);
    }
}

export async function me(req, res) {
    res.json({ data: req.user });
}
