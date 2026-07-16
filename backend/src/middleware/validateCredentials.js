/* A bejelentkezés és a regisztráció törzsének ellenőrzése.

   A tét nem formaság: a name egyenesen egy adatbázis-lekérdezésbe megy
   (User.findOne({name: ...})). Ha nem kényszerítjük ki, hogy STRING legyen,
   akkor egy saját kliens objektumot is küldhet — például {"$ne": null} —, amit
   a Mongoose lekérdezés-OPERÁTORKÉNT értelmezne, nem értékként. Ez a NoSQL-
   injekció: a szűrő jelentése változik meg. Bejelentkezni így sem lehetne
   (a jelszó-ellenőrzés utána jön), de a fiókok létezése kideríthető lenne,
   ezért a szigorú típusellenőrzés a helyes válasz.

   A jelszó erősségét NEM itt nézzük: az a regisztráció saját szabálya, és a
   User/create controllerben él (ott a hibaüzenete is). */

const MAX_NEV = 50;
const MAX_JELSZO = 200;   // a bcrypt 72 bájt fölött csonkol; a korlát a DoS ellen van

module.exports = (request, response, next) => {
    const {name, password} = request.body ?? {};

    if (typeof name !== "string" || !name.trim())
        return response.status(400).json("A felhasznalonev megadasa kotelezo.");
    if (name.length > MAX_NEV)
        return response.status(400).json(`A felhasznalonev legfeljebb ${MAX_NEV} karakter lehet.`);
    if (typeof password !== "string" || !password)
        return response.status(400).json("A jelszo megadasa kotelezo.");
    if (password.length > MAX_JELSZO)
        return response.status(400).json(`A jelszo legfeljebb ${MAX_JELSZO} karakter lehet.`);

    next();
};
