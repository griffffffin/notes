/* AZ IDÉZET TITKOSÍTOTT TARTALMA — a híd a szekció-út (szerkesztő, lista) és a
   generikus tartalom-titkosító (e2ee/content.ts) között.

   Itt dől el, MELY mezők tartalmiak (quote, author, fontSize, createdAt) — ezek egyetlen
   JSON-szövegbe sorosodnak, azt titkosítja az `encryptContent` egy `ciphertext` borítékba,
   és az megy a szerverre. A szerkezeti mezők (_id, order) NYÍLTAK maradnak, azokat a
   szerver kezeli (l. E2EE.md 4.). A visszafejtés az ellentéte: a borítékból JSON, abból —
   SÉMÁVAL szűrve — a tartalmi mezők.

   MIÉRT SÉMÁVAL A VISSZAFEJTETT JSON. A tartalmat MI titkosítjuk, tehát a sikeresen
   megfejtett (GCM-hitelesített) blob a MI korábbi írásunk — de egy régebbi app-verzióból
   is származhat, más alakkal. A határon ezért itt is séma szűr, nem hit (l. CLAUDE.md:
   „ami kívülről jön, az unknown"; a JSON.parse eredménye is az). Így egy jövőbeli séma-
   váltás nem NÉMÁN rossz mezőt olvas, hanem hangosan elhasal (a hívó a hibaágra kerül).

   A MESTERKULCSOT a getMasterKey adja (zároltan DOB): a hívónak (a felület) gondoskodnia
   kell róla, hogy zárolt állapotban ne is jusson idáig — a kapu a lock-képernyő (app.tsx). */

import * as v from "valibot";
import {encryptContent, decryptContent} from "../../e2ee/content";
import {getMasterKey} from "../../masterKeySession";
import {quoteContentSchema} from "../../types/api";
import type {QuoteContent} from "../../types/api";

/* A szekció AZONOSÍTÓJA az AAD-hez (section|_id). Stabil, belső címke — NEM az
   endpoint és NEM a navigációs út (azok külön fogalmak, l. endpoints.ts), csak
   véletlenül egyforma a szöveg. Egy elemet MINDIG ugyanezzel a címkével titkosítunk
   és fejtünk, különben a GCM-decrypt elhasalna. */
const SECTION = "quotes";

/* TITKOSÍTÁS: a tartalmi mezőkből (createdAt-tel együtt) boríték. A hívó (a
   szerkesztő) állítja össze a `content`-et; a createdAt-et létrehozáskor ő gyártja,
   szerkesztéskor a betöltött blobból hordozza tovább (l. save.tsx). */
export const encryptQuote = (id: string, content: QuoteContent): string =>
    encryptContent(getMasterKey(), SECTION, id, JSON.stringify(content));

/* VISSZAFEJTÉS: a borítékból a tartalmi mezők. DOB, ha a mesterkulcs zárolt, ha a
   GCM-címke nem stimmel (megbuherált/rossz helyre tett blob), vagy ha a megfejtett
   JSON nem a várt alakú. A hívó dönti el, mit tesz vele: a listánál egy hibás elem ne
   vigye magával az egészet (l. card.tsx), a szerkesztőnél a betöltés hibaága. */
export const decryptQuote = (id: string, ciphertext: string): QuoteContent =>
    v.parse(quoteContentSchema, JSON.parse(decryptContent(getMasterKey(), SECTION, id, ciphertext)));
