import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import { getDb } from "./connection.js";

export async function findAllUsers() {
    const db = getDb();
    const users = await db.collection("users").find({}, { projection: { password: 0 } }).toArray();
    return users;
}

export async function findUserById(id) {
    try {
        const db = getDb();
        const user = await db.collection("users").findOne(
            { _id: new ObjectId(id) },
            { projection: { password: 0 } }
        );
        return user;
    } catch {
        return null;
    }
}

export async function findUserByEmail(email) {
    const db = getDb();
    return await db.collection("users").findOne({ email });
}

export async function createUser({ name, email, password }) {
    const db = getDb();

    const existing = await db.collection("users").findOne({ email });
    if (existing) {
        const err = new Error("El email ya está registrado");
        err.status = 400;
        throw err;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.collection("users").insertOne({ name, email, password: hashedPassword });
    return result;
}

export async function validateCredentials(email, password) {
    const db = getDb();
    const user = await db.collection("users").findOne({ email });
    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    return user;
}
