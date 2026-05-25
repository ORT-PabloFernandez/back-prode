import { createUser, validateCredentials } from "../data/userRepository.js";

export async function registerService({ name, email, password }) {
    return await createUser({ name, email, password });
}

export async function loginService(email, password) {
    const user = await validateCredentials(email, password);
    if (!user) {
        const err = new Error("Credenciales inválidas");
        err.status = 401;
        throw err;
    }
    const { password: _pw, ...userWithoutPassword } = user;
    return userWithoutPassword;
}
