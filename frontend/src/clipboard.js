/* Szöveg VÁGÓLAPRA másolása — két úton, mert a modern út nálunk nem mindig él.

   A mai szabvány a `navigator.clipboard.writeText`, DE azt a böngésző csak
   "biztonságos környezetben" (secure context) adja oda: HTTPS-en vagy
   localhoston. A mi appunk a házi hálón sima HTTP-n szolgál ki (a Pi IP-címén),
   ott tehát a `navigator.clipboard` egyszerűen NEM LÉTEZIK — mérve 2026-08-01 a
   http://<pi>:3001 címen: `typeof navigator.clipboard === "undefined"`. Ha csak
   a modern utat használnánk, a megosztás-gomb némán nem csinálna semmit pont
   ott, ahol a leginkább kell (telefonról megosztani egy idézetet).

   Ezért a tartalék út a RÉGI, elavultnak jelölt `document.execCommand("copy")`:
   az a kijelölésre dolgozik, nem kér biztonságos környezetet, és minden mai
   böngésző érti (a "deprecated" jelzés itt nem törlést jelent, hanem azt, hogy
   új kódban ne EZ legyen az első választás — nálunk nem is az).

   Visszatérési érték: `true`, ha a másolás sikerült. A hívó ebből tudja, mutathat-e
   visszajelzést. */
export async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Megtagadott engedély vagy nem-felhasználói esemény: jöhet a tartalék út.
        }
    }
    return copyBySelection(text);
}

/* A tartalék út: a szöveget egy ideiglenes mezőbe tesszük, kijelöljük, és a
   böngésző másolás-parancsával elvisszük.

   A részletek nem díszek:
     - readonly + képernyőn kívüli pozíció: a mező ne villanjon fel, és a
       telefonos billentyűzet se ugorjon elő a fókuszra;
     - explicit focus() a kijelölés előtt: a másolás-parancs a FÓKUSZÁLT elem
       kijelölését viszi el, a select() magától nem mindenhol fókuszál;
     - setSelectionRange a select() UTÁN: iOS Safarin a select() önmagában nem
       jelöl ki semmit egy readonly mezőben;
     - a korábbi kijelölés és a korábbi FÓKUSZ visszaállítása: a szerkesztőben
       épp gépelhet a felhasználó — a másolás ne lopja el a kurzort a szövegből. */
function copyBySelection(text) {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "-1000px";
    field.style.opacity = "0";
    document.body.appendChild(field);

    const previousFocus = document.activeElement;
    const selection = document.getSelection();
    const previousRange = selection?.rangeCount > 0 ? selection.getRangeAt(0) : null;

    field.focus({preventScroll: true});
    field.select();
    field.setSelectionRange(0, text.length);
    let copied = false;
    try {
        copied = document.execCommand("copy");
    } catch {
        // Régi/korlátozott böngésző: nincs mit tenni, false-szal jelezzük.
    }

    field.remove();
    if (previousRange) {
        selection.removeAllRanges();
        selection.addRange(previousRange);
    }
    previousFocus?.focus?.({preventScroll: true});
    return copied;
}
