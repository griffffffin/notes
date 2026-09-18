/* AZ E2EE-BEIRATKOZÁS ÚTJA a regisztrációtól a feloldásig, controller-szinten.

   Amit bizonyít: (1) a regisztráció a `wrappedMk`-t BORSOZVA tárolja (nem a nyers
   értéket), és a válasz csak a név (a kliensnek nincs szüksége az echóra); (2) a belépés
   és (3) az újratöltéskori /me a beiratkozást VISSZAADJA, a `wrappedMk`-ról a borsot
   LESZEDVE — különben a kliens a jelszavából nem tudná kicsomagolni a mesterkulcsot.

   Adatbázis nincs: a Users modellt a require.cache-ben cseréljük (a create/login/session
   tesztek mintájára) — itt EGYSZERRE konstruktor (create) és statikus findOne/findById
   (login, auth). A jelszó-hash valódi (argon2id), tehát a login tényleg ellenőrzi. */

const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok-csak-a-teszthez";
// A bors-titok a teszthez (32 bájt base64), mielőtt a modulok betöltik a pepper.js-t.
process.env.E2EE_PEPPER = process.env.E2EE_PEPPER || Buffer.alloc(32, 3).toString("base64");

const USER_ID = "507f1f77bcf86cd799439011";
const NAME = "e2eeuser";
// Formailag jó, nincs a gyakori-listán, nem egyezik a névvel — átjut a regisztráción.
const PASSWORD = "Str0ngUnique9";
const ENROLLMENT = {
    wrappedMk: "e2ee1.YWJjZGVmZ2hpamts.bm9wcXJzdHV2d3h5ekFCQ0RFRkdISUpLTA==",
    kdfSalt: "c2FsdHNhbHRzYWx0c2E=", // 16 bájt base64
    kdf: {algorithm: "argon2id", memorySize: 65536, iterations: 3, parallelism: 1},
};

let storedDoc = null;
const userModelPath = require.resolve("../../models/users");
function FakeUser(doc) { Object.assign(this, doc); }
FakeUser.prototype.save = async function save() {
    storedDoc = {_id: USER_ID, tokenVersion: 0, ...this};
    return storedDoc;
};
FakeUser.findOne = async ({name}) => (storedDoc && storedDoc.name === name ? storedDoc : null);
FakeUser.findById = async (id) => (storedDoc && String(id) === USER_ID ? storedDoc : null);
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true, exports: FakeUser,
};

const create = require("./create");
const login = require("./login");
const me = require("./me");
const auth = require("../../middleware/auth");

const app = express();
app.use(express.json());
app.use("/create", create);
app.use("/login", login);
app.use(auth);
app.use("/me", me);

const register = () =>
    request(app).post("/create").send({name: NAME, password: PASSWORD, ...ENROLLMENT});
const signIn = () => request(app).post("/login").send({name: NAME, password: PASSWORD});
const tokenCookie = (response) =>
    (response.headers["set-cookie"] ?? []).find((cookie) => cookie.startsWith("token="));

test.beforeEach(() => { storedDoc = null; });

test("a regisztráció BORSOZVA tárolja a wrappedMk-t, a válasz csak a név", async () => {
    const response = await register();

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, {name: NAME},
        "a regisztráció ne echozza vissza a beiratkozást — a kliensnél már megvan");
    assert.ok(storedDoc.wrappedMk.startsWith("pepper1."),
        "a tárolt wrappedMk-nak borsozottnak kell lennie");
    assert.notStrictEqual(storedDoc.wrappedMk, ENROLLMENT.wrappedMk,
        "a nyers wrappedMk nem kerülhet változatlanul a tárba");
});

test("a belépés visszaadja a beiratkozást, a wrappedMk-t BORSTALANÍTVA", async () => {
    await register();

    const response = await signIn();

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body.enrollment, ENROLLMENT,
        "a kliens a feloldáshoz a NYERS (borstalan) wrappedMk-t + salt + kdf-et várja");
    assert.strictEqual(response.body.name, NAME);
});

test("a /me újratöltéskor visszaadja a beiratkozást", async () => {
    const cookie = tokenCookie(await register());

    const response = await request(app).post("/me").set("Cookie", cookie).send({});

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body.enrollment, ENROLLMENT);
    assert.strictEqual(response.body.name, NAME);
});
