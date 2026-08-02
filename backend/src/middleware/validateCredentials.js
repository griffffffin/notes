/* A bejelentkezés és a regisztráció törzsének ellenőrzése.

   A tét nem formaság: a name egyenesen egy adatbázis-lekérdezésbe megy
   (Users.findOne({name: ...})). Ha nem kényszerítjük ki, hogy STRING legyen,
   akkor egy saját kliens objektumot is küldhet — például {"$ne": null} —, amit
   a Mongoose lekérdezés-OPERÁTORKÉNT értelmezne, nem értékként. Ez a NoSQL-
   injekció: a szűrő jelentése változik meg. Bejelentkezni így sem lehetne
   (a jelszó-ellenőrzés utána jön), de a fiókok létezése kideríthető lenne,
   ezért a szigorú típusellenőrzés a helyes válasz.

   A jelszó erősségét NEM itt nézzük: az a regisztráció saját szabálya, és a
   Users/create controllerben él (ott a hibaüzenete is). */

const MAX_NAME = 50;
const MAX_PASSWORD = 200;   // a bcrypt 72 bájt fölött csonkol; a korlát a DoS ellen van

module.exports = (request, response, next) => {
    const {name, password} = request.body ?? {};

    if (typeof name !== "string" || !name.trim())
        return response.status(400).json("A felhasználónév megadása kötelező.");
    if (name.length > MAX_NAME)
        return response.status(400).json(`A felhasználónév legfeljebb ${MAX_NAME} karakter lehet.`);
    if (typeof password !== "string" || !password)
        return response.status(400).json("A jelszó megadása kötelező.");
    if (password.length > MAX_PASSWORD)
        return response.status(400).json(`A jelszó legfeljebb ${MAX_PASSWORD} karakter lehet.`);

    next();
};
