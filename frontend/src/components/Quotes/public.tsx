import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import Spinner from "../spinner";
import {useAuth} from "../../contexts/auth-context";
import {useTheme} from "../../contexts/theme-context";
import {useQuoteAccent} from "./useQuoteAccent";
import {renderBold} from "./bold";
import {logRequestError} from "../../log";
import {ENDPOINTS} from "../../endpoints";
import {publicQuoteSchema} from "../../types/api";
import type {PublicQuote} from "../../types/api";
import {parseResponse} from "../../contractFault";
import {responseStatus} from "../../httpError";
import LoadFailedNotice from "../loadFailedNotice";

/* Egy megosztott idézet PUBLIKUS nézete (/quotes/:author/:id). Token nélkül is
   megnyitható (a backend readById az auth ELŐTT ül), ezért ez a route a
   bejelentkezett ÉS a kijelentkezett route-táblában is szerepel. Csak
   megjelenít: az idézet szövege nagyban, a szerző alatta — nincs szerkesztés,
   nincs húzás. A :author URL-szegmenst nem használjuk a lekéréshez (az id
   egyedi), csak olvashatóságot ad a linknek. */
export default function QuotePublic() {
    const {id} = useParams();
    const {handleAxios} = useAuth();
    const {color} = useTheme();
    // A megosztott egy-idézet nézet is a quotes szekció: világos témán tinta-kék.
    useQuoteAccent();
    // A betöltés végéig undefined (nem null): a `!quote` őr a spinnert tartja.
    const [quote, setQuote] = useState<PublicQuote | undefined>(undefined);
    const [notFound, setNotFound] = useState(false);
    /* A NEM LÉTEZŐ és a NEM ELÉRHETŐ idézet KÉT KÜLÖN dolog — eddig egyformán
       "Nem létező idézet."-nek látszottak (az átvizsgálás találta, 2026-08-18).
       Egy megosztott linket megnyitó látogató így azt hihette, hogy az idézetet
       törölték, holott csak a hálózat akadt meg (vagy a szerver válasza csúszott
       el a sémától). Ez rosszabb, mint a semmi: HAMIS állítást tesz. */
    const [loadFailed, setLoadFailed] = useState(false);
    // Újrapróbálkozás-számláló: a betöltő effekt függősége (l. a szerkesztőknél).
    const [retryCount, setRetryCount] = useState(0);

    /* Versenyhelyzet-őr: a route :id-je változásakor az effekt újrafut, és két
       párhuzamos válasz fordított sorrendben is visszaérhet — a RÉGI id válasza
       felülírhatná a frisset. Az `active` zászló a leszereléskor (és minden
       újrafutáskor) hamisra vált, így a lejárt kérés callbackje már nem ír state-et.
       Minta: CardList/useSortableCards.ts. */
    useEffect(() => {
        let active = true;
        handleAxios(ENDPOINTS.quoteById, {id}, (response) => {
            /* A PUBLIKUS séma, nem a teljes Quote: ez a végpont whitelisttel csak
               a szöveget, a szerzőt és a betűméretet adja ki (l. readById.js) —
               sorszámot, tulajdonost, időbélyeget SOHA. A komponens korábban a
               teljes Quote-ot ígérte magának; a futásidejű ellenőrzés bevezetése
               mutatta meg, hogy az az ígéret hamis volt (l. types/api.ts). */
            const loaded = parseResponse(publicQuoteSchema, response.data, ENDPOINTS.quoteById);
            if (active) setQuote(loaded);
        }, (error) => {
            logRequestError(error);
            if (!active) return;
            /* A SZERVER VÁLASZÁRA hagyatkozunk, nem a hiba puszta tényére — de
               a KONKRÉT válaszra, nem arra, hogy VAN-e válasz.

               Két státusz jelenti azt, hogy nincs ilyen idézet: a 400 (a
               validateObjectId elutasította az azonosító ALAKJÁT, tehát ilyen id
               nem is létezhet) és a 404 (a szerver megnézte: nincs).

               Minden más csak annyit jelent, hogy MOST nem tudjuk betölteni.
               Státusz nélkül (időtúllépés, megszakadt kapcsolat, séma-bukás) el
               sem jutottunk a szerverig; 500-nál (serverError.js) pedig a
               szerver akadt meg — az idézet attól még ott lehet. Korábban ez a
               vizsgálat `=== undefined` volt, ami az 500-at is a "nem létezik"
               ágra küldte: egy adatbázis-zökkenő így azt állította a megosztott
               link megnyitójának, hogy az idézetet törölték. */
            const status = responseStatus(error);
            if (status === 400 || status === 404) setNotFound(true);
            else setLoadFailed(true);
        });
        return () => { active = false; };
    }, [id, handleAxios, retryCount]);

    if (loadFailed) return (
        <LoadFailedNotice message="Hiba az oldal betöltése közben."
                          onRetry={() => { setLoadFailed(false); setRetryCount((count) => count + 1); }}/>
    );

    // A "nincs ilyen idézet" üzenet 200%-os (a --quote-fs a .caveat 155%-át írja
    // felül, l. index.css) — hangsúlyosabb, mint a törzsszöveg.
    if (notFound) return <div style={{"--quote-fs": "200%"}}
                              className={"text-center mt-5 caveat text-" + color}>Nem létező idézet.</div>;
    if (!quote) return <Spinner class="min-vh-75"/>;

    return (
        <div className={"col-11 col-sm-10 col-md-8 col-lg-7 col-xl-6 card mx-auto mt-2 " +
            "bg-transparent border-2 border-" + color}>
            {/* A törzsszöveg SORKIZÁRT (mint a szerkesztőben és a listában); a szerző
                marad középen (l. a card-footer text-center-jét). A textAlign inline,
                mert a Bootstrap text-* osztályok !important-ja verné — ezért a
                text-start-ot le is vettük. */}
            {/* A megosztott idézet a SAJÁT betűméretével jelenik meg (--quote-fs, a
                readById adja vissza), és a .caveat szabály ebből rajzol. Az érték
                mindig ott van: a séma megköveteli (l. types/api.ts) — a korábbi
                `?? 155` visszaesés egy olyan esetre készült, amit a szerver nem tud
                előállítani, a séma óta pedig ide nem is jutna el. */}
            <div className={"card-body caveat px-4 py-4 text-" + color}
                 style={{"--quote-fs": quote.fontSize + "%", whiteSpace: "pre-wrap",
                     textAlign: "justify"}}>
                {renderBold(quote.quote)}
            </div>
            {quote.author &&
                <div className={"card-footer caveat text-center bg-transparent border-0 pb-3 text-" + color}>
                    {quote.author}
                </div>}
        </div>
    );
}
