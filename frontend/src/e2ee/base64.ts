/* BASE64 a böngésző btoa/atob-jával, DARABOLVA — a bájt↔szöveg átalakítás egy helyen az
   e2ee-modulokhoz (aead.ts, masterKeySession.ts).

   A DARABOLÁS NEM ÓVATOSKODÁS: a `String.fromCharCode(...bytes)` a tömb MINDEN bájtját
   külön argumentumként adná át, és a JS-motorok argumentum-száma véges — egy nagyobb
   tartalomnál `RangeError: Maximum call stack size exceeded` lenne belőle, némán. A 8192-es
   darabolás ezt zárja ki. A részletes indoklás a draftCrypto.ts-ben: az KÜLÖN feature
   (piszkozat, más formátum), saját másolattal; ez a közös segéd az ÚJ e2ee-modulokhoz. */

const CHUNK = 8192;

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let index = 0; index < bytes.length; index += CHUNK)
        binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
    return btoa(binary);
}

export const base64ToBytes = (text: string): Uint8Array =>
    Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
