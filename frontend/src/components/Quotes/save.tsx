import {useCallback, useEffect, useLayoutEffect, useRef, useState,
    type ChangeEvent, type FormEvent, type KeyboardEvent} from "react";
import {useBlocker, useLocation, useNavigate, useParams} from "react-router-dom";
import Spinner from "../spinner";
import SubmitButton from "../Button/submitButton";
import AuthorInput from "./authorInput";
import ShareButton from "./shareButton";
import Order, {STEP_DELAY_MS} from "../Todos/order";
import DeleteAndModal from "../Todos/deleteAndModal";
import {toggleBold, normalizeBold} from "./bold";
import {useAuth} from "../../contexts/auth-context";
import {useTheme} from "../../contexts/theme-context";
import {useQuoteAccent} from "./useQuoteAccent";
import {logRequestError} from "../../log";
import {responseStatus} from "../../httpError";
import {ENDPOINTS} from "../../endpoints";
import {fieldAnchor, type FieldAnchor} from "../Editor/fieldAnchor";
import ValidationTooltip from "../Editor/validationTooltip";
import {useEscapeSubmit} from "../Editor/useEscapeSubmit";
import {useIdleTimer} from "../Editor/useIdleTimer";
import {quoteForEditSchema, lastOrderSchema} from "../../types/api";
import {PATHS} from "../../paths";
import {parseResponse} from "../../contractFault";
import LoadFailedNotice from "../loadFailedNotice";
import * as v from "valibot";
import {clearDraft, draftKey, readDraft, saveDraft} from "../../drafts";
import {newObjectId} from "../../objectId";
import {saveWithRetry} from "../../saveRetry";
import {registerPendingSave} from "../../pendingSave";

/* Az új idézet alap betűmérete SZÁZALÉKBAN — szándékosan a Szerző-mező méretével
   egyezik (a .caveat szabály 155%-a), hogy a szerkesztőben az idézet és a szerző
   egy méretűnek induljon, és a lista is így mutassa. A "Betűméret"-stepperrel
   idézetenként átállítható; a mező nélküli régi idézetek is ekkorák. */
const DEFAULT_FONT_SIZE = 155;

/* A szerkesztő és a szerver közti ÖSSZEHASONLÍTHATÓ pillanatkép: az a négy mező,
   amit a "változott-e?" ellenőrzés néz. A `loaded` ref ezt tárolja (a szerver adta
   állapot). Az `author` itt már NEM opcionális: betöltéskor `q.author ?? ""`-vel
   üres stringgé normalizáljuk (a mező value-ja is string), így az összevetés két
   sima string közt megy. */
const snapshotSchema = v.object({
    quote: v.string(),
    author: v.string(),
    order: v.number(),
    fontSize: v.number(),
});
type QuoteSnapshot = v.InferOutput<typeof snapshotSchema>;

/* A Mentés gomb azonosítója — a bukás utáni fókuszáláshoz kell (l. lentebb).
   Ugyanaz a fogás, mint a to-do szerkesztőjében és a törlés-modalban. */
const SAVE_BUTTON_ID = "quoteSaveButton";

/* A MENTENDŐ adat: a pillanatkép + update-nél a szerkesztett elem id-je. A három
   mentési útvonal (blocker, leváláskori mentés, autosave) ezt küldi. */
type QuotePayload = QuoteSnapshot & {id?: string};

/* A PISZKOZAT ugyanaz a négy mező, mint a pillanatkép — ezért UGYANAZ a séma áll
   mögötte, nem egy második leírás. A piszkozat a böngésző tárolójából jön VISSZA,
   tehát kívülről érkező érték: sémával olvassuk, nem hittel (l. drafts.ts). Mivel
   a `QuoteSnapshot` típus is ebből a sémából származik, a kettő nem tud elcsúszni
   egymástól: egy új mező felvétele mindkettőt egyszerre viszi. */
const draftSchema = snapshotSchema;
type StoredDraft = QuoteSnapshot;

/* A propokat a routes.tsx QuotesSaveRoute wrapperje adja. Az idézet-szerkesztő
   SZŰKEBB, mint a to-dóé: nincs kategória, ezért se `handleCategoryChange`, se
   `categories` (l. Todos/save.tsx SaveProps). A `handleLinkClicked` paraméter
   nélküli (l. app.tsx). */
type SaveProps = {
    isUpdate: boolean;
    handleLinkClicked: () => void;
    /* JELENTÉS FELFELÉ, hogy fut-e mentés — a navbar ebből tudja, hogy a linkjei
       most nem visznek sehova (l. RoutesProps). Külön prop, nem a belső state:
       a szerkesztő állapotát az App tárolja, mert a navbar is olvassa. */
    setIsSaving: (isSaving: boolean) => void;
};

/* Az idézet-szerkesztő (create és update). A to-do save.tsx VÉKONYABB mása: az
   idézet-textarea + szerző-input + a KÖZÖS Order sorszám-választó (a to-doból),
   de nincs szín, listaelem vagy százalék. A KILÉPÉS-viselkedést a to-do mintája
   adja: a Mentés gomb / Escape a formot süti el, majd navigál; a navigációt
   (Mentés, Escape, logó, "+", Vissza gomb, szekció-váltás) a useBlocker kapja el,
   és amíg van mentenivaló, előbb ELLENŐRIZ + MENT, csak utána enged tovább
   (üres idézetnél hibabuborék + maradás). A törlést a paraméterezett DeleteAndModal
   intézi (a /quotes/delete végponttal, vissza a /quotes-ra). */
export default function QuoteSave(props: SaveProps) {
    const [quote, setQuote] = useState("");
    const [author, setAuthor] = useState("");
    const [isQuoteValid, setIsQuoteValid] = useState(false);
    // Az Order kezdőértéke 1 — pontosan a to-do mintájára: create-nél az új idézet
    // alapból a lista ELEJÉRE kerül (1), onnan léptethető lejjebb.
    const [order, setOrder] = useState(1);
    const [lastOrder, setLastOrder] = useState<number | null>(null);
    /* A BETÖLTÉS ELBUKOTT-e. A karika eltűnése a `lastOrder` megérkezéséhez van
       kötve, tehát a lekérés bukása után magától SOSEM tűnne el — a felület
       örökké várakozna valamire, ami nem jön (a /create ágon ez az EGYETLEN
       kérés, ott tehát az egész szerkesztő használhatatlan maradna). */
    const [loadFailed, setLoadFailed] = useState(false);
    /* ÚJRAPRÓBÁLKOZÁS-SZÁMLÁLÓ: a betöltő effekt függőségei közt áll, tehát a
       léptetése újrafuttatja a lekéréseket — oldalfrissítés nélkül, ami a
       szerkesztőben már beírt szöveget is elvinné. */
    const [retryCount, setRetryCount] = useState(0);
    // Per-idézet betűméret SZÁZALÉKBAN. Create-nél az alap a Szerző mezőével egyező
    // DEFAULT_FONT_SIZE, update-nél a betöltött érték. A "Betűméret" stepper állítja;
    // a nézetek a --quote-fs CSS-változón át rajzolják ekkorára az idézetet.
    const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
    const [isLoading, setIsLoading] = useState(true);
    const [validation, setValidation] = useState<FieldAnchor | null>(null);
    const {id} = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const {handleAxios, token} = useAuth();
    const {color} = useTheme();
    // A szerkesztő is a quotes szekció része: világos témán tinta-kék akcentus.
    useQuoteAccent();
    const formRef = useRef<HTMLFormElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // A Ctrl+B utáni kijelölést a render UTÁN állítjuk vissza (a setQuote
    // újrarajzol, előbb a DOM-értéknek frissülnie kell) — ide tesszük a [start,end]-t.
    const pendingSelection = useRef<[number, number] | null>(null);
    const loaded = useRef<QuoteSnapshot | null>(null);
    /* Igaz, ha a mentés MÁR elintézte a távozást (a blocker mentés+proceed ága, vagy a
       Törlés) — ilyenkor a leváláskori (unmount) mentés NEM fut le újra (create-nél
       nehogy duplán hozzon létre). A blocker shouldBlock-ja is ezt nézi: ha igaz, nem
       blokkol (a törlés-navigáció és a már-elintézett proceed szabadon átmehet). */
    const leftViaForm = useRef(false);
    /* FUT-E ÉPP MENTÉS — l. a Todos/save.tsx azonos pontját a részletes indoklásért.
       Röviden: a `leftViaForm` korábban egyszerre jelentette azt, hogy "most mentek"
       és azt, hogy "kész, megyek", ezért a mentés teljes ideje alatt BÁRKI navigációja
       átment, és a szerkesztő eltűnhetett a mentés alól. A ref a shouldBlock-é (az
       stabil függvény, csak refből lát frisset), a state a gomb feliratáé. */
    const savingRef = useRef(false);
    const [isSaving, setIsSaving] = useState(false);
    /* A FUTÓ MENTÉS ÍGÉRETE — hogy a KIJELENTKEZÉS MEGVÁRHASSA.

       A pendingSave.ts szabálya: "előbb a mentés, aztán a kilépés". A leváláskori
       mentés ezt eddig úgy teljesítette, hogy ő MAGA indított egy mentést és azt
       adta vissza. Csakhogy a hasSilentWork() mostantól hamisat ad, amíg fut egy
       mentés (különben mellé indítana egy másodikat, l. ott; a részletes indoklás a Todos/save.tsx-ben) — így a kijelentkezés
       ÜRES ígéretet kapott volna, és a token törlése megelőzhette volna a választ.
       A megoldás nem az őr gyengítése: itt a MÁR FUTÓ mentés ígéretét adjuk oda. */
    const inFlightRef = useRef<Promise<void> | null>(null);

    /* A MENTÉS ELBUKOTT — csak a fókusz-visszajelzéshez (l. lentebb az effektet). */
    const [saveFailed, setSaveFailed] = useState(false);
    const setIsSavingUp = props.setIsSaving;
    const markSaving = useCallback((value: boolean) => {
        savingRef.current = value;
        setIsSaving(value);
        setIsSavingUp(value);
        if (value) setSaveFailed(false);
        else inFlightRef.current = null;
    }, [setIsSavingUp]);
    /* Leváláskor visszavonjuk a felfelé jelentett állapotot — különben egy mentés
       közbeni kijelentkezés után a navbar linkjei örökre a "nem visz sehova"
       egérmutatót viselnék (l. Todos/save.tsx részletes indoklását). */
    useEffect(() => () => setIsSavingUp(false), [setIsSavingUp]);
    /* A leváláskor futtatandó mentés legfrissebb változata — minden renderben
       frissül, hogy az unmount az aktuális állapotot mentse (l. lentebb). */
    /* A típus KIMONDVA: a kezdőérték egy üres függvény volna, amiből a fordító
       `() => void`-ot következtetne — a mentés viszont PROMISE-t ad vissza, hogy a
       kijelentkezés megvárhassa (l. pendingSave.ts). */
    const saveOnLeaveRef = useRef<() => Promise<void>>(() => Promise.resolve());
    /* A "van-e mentenivaló?" (dirty) legfrissebb értéke — a useBlocker shouldBlock-ja
       ref-ből olvassa, hogy stabil (üres deps) függvény lehessen, mégis a friss
       állapotot lássa. */
    const isDirtyRef = useRef(false);
    /* Egy blokkolt navigációt EGYSZER dolgozunk fel — a StrictMode (dev) kétszer
       futtatja az effekteket, enélkül a mentés duplázódna. */
    const handledBlockRef = useRef(false);

    const isUpdate = Boolean(props.isUpdate);

    const url = isUpdate ? ENDPOINTS.quoteUpdate : ENDPOINTS.quoteCreate;
    /* Az azonosító az URL /update/:id szegmenséből jön. A route-ban a :id kötelező,
       tehát update-nél mindig megvan; a csupasz /update-et a "*"-ág fogja el, ide
       nem jut. Create-nél nincs szerkesztett elem: null. */
    const quoteId = isUpdate ? id : null;

    /* A PISZKOZAT kulcsa a szerkesztett ELEMHEZ tartozik (create-nél a szekció
       közös "create" piszkozatához) — így két idézet piszkozata nem üti egymást,
       és a create-piszkozat sem keveredik egy meglévő elem szerkesztésével. */
    const draftStorageKey = draftKey("quotes", quoteId ?? null);
    /* EGYSZER olvassuk ki, a legelső renderben (lusta kezdőérték): a piszkozat a
       megnyitás PILLANATÁBAN érvényes állapot. A típus kimondva, mert a kezdőérték
       `null` is lehet (l. CLAUDE.md, "kezdőérték ≠ típus"). */
    const [draft, setDraft] = useState<{payload: StoredDraft; base: StoredDraft | null; savedAt: Date;
        itemId: string | null} | null>(
        () => readDraft(draftStorageKey, draftSchema));

    /* A piszkozat legfrissebb értéke REFBEN is: a betöltő effekt zárványa
       különben a mountkori (esetleg már elavult) állapotot látná, a `draft`-ot
       pedig nem tehetjük a függőségei közé (a visszatöltés maga állítja át, amitől
       a betöltés újraindulna). */
    const draftRef = useRef(draft);
    draftRef.current = draft;

    /* AZ ÚJ ELEM AZONOSÍTÓJA — l. a Todos/save.tsx azonos pontját a részletes
       indoklásért. Röviden: create-nél a KLIENS gyártja, mert a létrehozás
       idempotenciája ezen áll, és a FENTI, egyetlen piszkozat-olvasásból veszi
       vissza, ha van — enélkül egy F5 után új azonosítóval, tehát új elemként
       menne át a mentés. */
    const [newItemId] = useState<string | null>(
        () => isUpdate ? null : (draft?.itemId ?? newObjectId()));
    // A mentendő azonosító: update-nél a meglévő, create-nél az imént gyártott.
    const savedItemId = quoteId ?? newItemId;

    /* A piszkozat mezőinek beírása a szerkesztőbe — egy helyen, mert két hívója
       van: a magától induló visszaállítás (a betöltés végén) és a felajánlás
       „Visszatöltés" gombja. */
    const applyDraft = (payload: StoredDraft) => {
        setQuote(payload.quote);
        /* AZ ÉRVÉNYESSÉG JELZŐJE IS — l. a Todos/save.tsx azonos pontját: create-nél
           nincs szerver-betöltés, ami igazra állítaná, a piszkozat pedig programból
           tölti ki a mezőt. Nélküle a visszatöltött idézetet nem lehetne menteni.
           A szabály a mezőé (handleQuoteChange: `trim().length > 0`). */
        setIsQuoteValid(payload.quote.trim().length > 0);
        setAuthor(payload.author);
        setOrder(payload.order);
        setFontSize(payload.fontSize);
    };

    /* Két pillanatkép AZONOS-e. Ugyanaz az összevetés, amit a "változott-e az
       űrlap" vizsgálat is használ — a piszkozatnál arra kell, hogy eldöntsük:
       a szerveren történt-e bármi azóta, hogy a piszkozat készült. */
    const isSameSnapshot = (first: StoredDraft, second: StoredDraft) =>
        first.quote === second.quote && first.author === second.author
        && first.order === second.order && first.fontSize === second.fontSize;

    /* MI LEGYEN A PISZKOZATTAL, amikor a szerkesztő betöltött. Egyetlen döntés,
       felhasználói kérdés nélkül:

       - a szerveren SEMMI nem változott azóta, hogy a piszkozat készült (a
         betöltéskori állapot = a piszkozat `base`-e) → a piszkozat az egyetlen
         újabb változat, tehát VISSZAÁLL. A mentés elmaradása így fel sem tűnik.
       - a szerveren VÁLTOZOTT valami (másik eszközön mentettek) → a FRISSEBB
         változat nyer, a piszkozatot ELDOBJUK. Egy másik eszközön tudatosan
         elvégzett módosítás többet ér, mint egy el nem mentett szöveg, a
         választás felkínálása pedig inkább zavarna, mint segítene.
       - `fromServer === null` (CREATE): nincs mivel ütközni, tehát visszaáll.
       - nincs `base` (régi formátumú piszkozat) → update-nél nem tudjuk
         ellenőrizni, ezért a szerver változatát hagyjuk: kétségnél a szerver nyer. */
    const decideDraft = (fromServer: StoredDraft | null) => {
        const pending = draftRef.current;
        if (!pending) return;
        /* HÁROM ESET, és mindet a TARTALOM dönti el:

           1. a szerver ugyanaz, mint a betöltéskori állapot (`base`) → azóta
              senki nem mentett, a piszkozat az egyetlen újabb változat → VISSZA;
           2. a szerver MÁR A PISZKOZAT TARTALMÁT mutatja → a mi mentésünk
              valójában átment (a válasz veszett el útközben, ezért hittük
              bukásnak). Külön ág NEM kell hozzá: a visszaállítás úgyis ugyanazt
              a szöveget írná be, ami már ott van — a piszkozat egyszerűen
              okafogyott, és törlődik;
           3. a szerver mást mutat, mint bármelyik → egy MÁSIK eszközön mentettek
              → a frissebb, mentett változat marad, a piszkozat elvész.

           A 2. és a 3. eset viselkedése tehát azonos (törlés), de az OKUK más —
           és a 2. nem adatvesztés: a tartalom a szerveren van. */
        const restore = fromServer === null
            || (pending.base !== null && isSameSnapshot(pending.base, fromServer));
        if (restore) applyDraft(pending.payload);
        clearDraft(draftStorageKey);
        setDraft(null);
    };

    /* A döntés REFEN át hívódik a betöltő effektből: a függvény minden renderben
       újra elkészül, tehát függőségként a lekérést is minden renderben
       újraindítaná. A ref mindig a legfrissebb változatra mutat. */
    const decideDraftRef = useRef(decideDraft);
    decideDraftRef.current = decideDraft;

    /* Változatlan-e a szerkesztő ahhoz képest, amit menteni érdemes? Create-nél:
       üres (se idézet, se szerző) — ilyenkor nincs mentenivaló. Update-nél: a
       betöltöttel egyező tartalom (a mentés updatedAt-et is írna, tehát egy üres
       "Mentés" hazudná, hogy hozzányúltunk). Ha még nincs betöltve (loaded null:
       betöltés alatt vagy hiba után), szintén pristine — nincs mit menteni, és a
       betöltés-hiba leaveEditor()-ja se akadjon a blockerbe. */
    const isPristine = (cleanedQuote: string) => {
        if (isUpdate) {
            if (loaded.current == null) return true;
            return cleanedQuote === loaded.current.quote && author === loaded.current.author
                && order === loaded.current.order && fontSize === loaded.current.fontSize;
        }
        return !quote.trim() && !author.trim();
    };
    isDirtyRef.current = !isPristine(normalizeBold(quote));

    /* Van-e CSENDBEN mentendő munka? A két néma mentési útvonal (leváláskori mentés
       kijelentkezéskor, illetve a 10 perces autosave) UGYANEZT a három feltételt
       nézi: a mentés/törlés még nem intézte el a távozást, az idézet érvényes, és
       tényleg változott valami.

       A blocker SZÁNDÉKOSAN nem ezt használja: ott az üres idézet nem "nincs mit
       menteni", hanem HIBA — hibabuborékot kap és a szerkesztőben maradunk. Itt
       nincs kinek visszajelezni (nincs képernyő, ahol maradni lehetne), ezért a
       hiányos munkát csendben eldobjuk. */
    /* A `!savingRef.current` KÖTELEZŐ: enélkül egy kijelentkezés a MÁR FUTÓ mentés
       mellé indítana egy másodikat (create-nél két idézet jönne létre). */
    const hasSilentWork = () =>
        !leftViaForm.current && !savingRef.current && isQuoteValid && !isPristine(normalizeBold(quote));

    /* A useBlocker DATA ROUTERT kér (l. routes.tsx). shouldBlock: akkor blokkoljuk a
       navigációt, ha van mentenivaló (dirty) ÉS nem a mentés/törlés maga navigál
       (leftViaForm). A függvény üres deps-szel stabil, de refekből olvas, így a friss
       állapotot látja — a react-router így nem regisztrálja újra minden rendernél. */
    /* A `savingRef` ág: amíg a kérés úton van, a logó, a "+", az Escape és a
       böngésző Vissza gombja sem visz ki innen (l. Todos/save.tsx). */
    const shouldBlock = useCallback(() => !leftViaForm.current && (savingRef.current || isDirtyRef.current), []);
    const blocker = useBlocker(shouldBlock);

    /* Kilépés a szerkesztőből: update esetén VISSZA oda, ahonnan indult (a
       böngésző-előzményből), közvetlen link/F5 esetén (nincs app-előzmény) a
       listára; create után mindig a listára. A navigációt a blocker kapja el, ha
       van mentenivaló — ez indítja a mentést. */
    const leaveEditor = useCallback(() => {
        if (isUpdate && location.key !== "default") void navigate(-1);
        else void navigate(PATHS.quotes);
    }, [isUpdate, location.key, navigate]);

    /* Versenyhelyzet-őr: az effekt a `quoteId` változásakor újrafut (pl. /update/:id1 →
       /update/:id2 UGYANAZON a szerkesztő-példányon — a route key="quote-update", tehát
       nincs remount), és a `leaveEditor` váltásakor is (deps: location.key). Ilyenkor a
       KÉT lekérés (/quotes/edit + /quotes/last/order) újra elindul, és két párhuzamos
       válasz FORDÍTOTT sorrendben is visszaérhet — a RÉGI id válasza felülírhatná a
       frisset (a state-eket ÉS a `loaded` pillanatképet is). Az `active` zászló a
       leszereléskor és minden újrafutáskor hamisra vált, így a lejárt kérés callbackje
       már nem ír semmit.

       Ez a LEVÁLÁST is fedi: törlés (DeleteAndModal → /quotes) vagy a mentés utáni
       proceed után a szerkesztő leszerel — egy KÉSEI /quotes/edit-válasz ekkor már nem
       hívja a leaveEditor()-t egy megszűnt komponensen (a hiba-ág a 403/timeout után a
       listára navigálna, ami törlés után dupla, félrevezető navigáció volna).
       Minta: CardList/useSortableCards.ts. */
    useEffect(() => {
        let active = true;
        if (quoteId) {
            // A szerkesztő betöltése a HITELESÍTETT /quotes/edit-ről megy (nem a
            // publikus /quotes/id-ról): innen jön a sorszám is, tulajdonos-
            // ellenőrzés mögött. Idegen/törölt idézetnél 403 → leaveEditor.
            handleAxios(ENDPOINTS.quoteForEdit, {id: quoteId}, (response) => {
                if (!active) return;
                /* Az ELLENŐRZÉS AZ ELSŐ, minden state-írás előtt: hibás alaknál a
                   v.parse dob, és a szerkesztő a hibaágon lép ki a listára —
                   nem marad félig kitöltve. */
                const q = parseResponse(quoteForEditSchema, response.data, ENDPOINTS.quoteForEdit);
                setQuote(q.quote);
                setAuthor(q.author ?? "");
                setOrder(q.order);
                setFontSize(q.fontSize);
                setIsQuoteValid(Boolean(q.quote));
                /* A kurzort a betöltött szöveg VÉGÉRE tesszük (update, a to-do mintájára).
                   UGYANAZON az úton, mint a Ctrl+B: a pendingSelection-t a lenti layout-
                   effekt fókusz + setSelectionRange + scrollCaretIntoView hármassal
                   dolgozza fel. A scrollCaretIntoView getBoundingClientRect-je reflow-t
                   kényszerít, ami a villogó jelet AZONNAL kirajzolja (asztali Chrome enélkül
                   csak billentyűleütésre mutatta), és a kurzort láthatóvá is görgeti. */
                pendingSelection.current = [q.quote.length, q.quote.length];
                // A sorszám ÉS a betűméret is része a "változott-e" ellenőrzésnek: az
                // Order- és a Betűméret-stepperrel a felhasználó a szöveg érintése
                // nélkül is módosíthatja az idézetet.
                loaded.current = {quote: q.quote, author: q.author ?? "", order: q.order,
                    fontSize: q.fontSize};

                /* A PISZKOZATRÓL a betöltött állapot ismeretében döntünk:
                   visszaáll, ha a szerveren azóta semmi nem változott — különben
                   a frissebb, szerver-oldali változat nyer (l. decideDraft). */
                decideDraftRef.current(loaded.current);
            }, (error) => {
                if (!active) return;
                logRequestError(error);
                /* A SZERVER VÁLASZA DÖNT — az indoklás teljes egészében a to-do
                   szerkesztőjében (Todos/save.tsx, ugyanezen a hibaágon), mert a
                   két végpont szabálya azonos: a readForEdit.js is 403-at ad a
                   nem létezőre és az idegenre egyaránt. Röviden: a 403 az
                   EGYETLEN válasz, amiből tudjuk, hogy nincs mit betölteni —
                   minden más (státusz nélküli hiba, 500) csak annyit jelent,
                   hogy most nem sikerült, és arra az újrapróbálás a válasz, nem
                   a szerkesztőből való kinavigálás. */
                if (responseStatus(error) === 403) leaveEditor();
                else setLoadFailed(true);
            });
        }
        /* Az Order felső korlátja PONTOSAN a to-do mintáját követi (a viselkedés ne
           térjen el a to-dótól): create-nél az idézetek száma (N), update-nél N-1 —
           a szerkesztett elem a saját helyén már bent van, tehát a többiek közé
           tolható. Üres listánál 0. */
        handleAxios(ENDPOINTS.quoteLastOrder, {}, (response) => {
            if (!active) return;
            const last = parseResponse(lastOrderSchema, response.data, ENDPOINTS.quoteLastOrder);
            setLastOrder(last === 0 ? 0 : (isUpdate ? last - 1 : last));
        }, (error) => {
            if (!active) return;
            logRequestError(error);
            // Ugyanaz, mint a to-do szerkesztőjében: a karika helyett kimondjuk.
            setLoadFailed(true);
        });
        // CREATE: nincs betöltendő elem, tehát a piszkozatnak nincs mivel ütköznie.
        if (!quoteId) decideDraftRef.current(null);
        return () => { active = false; };
    }, [isUpdate, quoteId, handleAxios, leaveEditor, retryCount, draftStorageKey]);

    /* A betöltő feloldása a to-do mintájára: create-nél amint a felső korlát
       megvan; update-nél amint a betöltött idézet is beérkezett (a tartalom
       megjelent). Külön effekt, mert az adat több válaszból áll össze. */
    useEffect(() => {
        if (lastOrder === null) return;
        if (isUpdate) {
            if (quote && isQuoteValid) setIsLoading(false);
        } else setIsLoading(false);
    }, [isUpdate, lastOrder, quote, isQuoteValid]);

    // Escape = mentés + vissza, a "Mentés" gombbal azonos úton (l. useEscapeSubmit).
    useEscapeSubmit(formRef);

    /* A textarea magassága a TARTALOMHOZ nő, görgetősáv helyett (scrollbar tilos):
       előbb "auto"-ra állítjuk, hogy a böngésző a rows=4 alsó korláttal mérjen,
       majd a scrollHeight-re — az sosem kisebb a látható magasságnál, tehát rövid
       szövegnél a 4 sor marad, hosszúnál soronként magasodik.

       A "auto" pillanatra ÖSSZECSUKJA a mezőt (a lap magassága változik), amitől a
       böngésző elgörgethet — ez okozta, hogy gépelés/Ctrl+B közben a lap felugrott
       vagy a sort a képernyő aljára tolta. Ezért a lap görgetési pozícióját
       elmentjük az átméretezés ELŐTT, és utána visszaállítjuk: az editor nem ugrál. */
    const autoGrow = useCallback((el: HTMLTextAreaElement | null) => {
        if (!el) return;
        const scrollY = window.scrollY;
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
        if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
    }, []);

    /* A KURZOR láthatóvá görgetése — mint gépeléskor a böngésző natívan teszi, csak
       Ctrl+B-nél az preventDefault miatt elmarad. A textarea nem ad kurzor-koordinátát,
       ezért egy azonos szélességű/betűjű tükör-divbe másoljuk a kurzorig tartó
       szöveget, és a lezáró span offsetTop-ja adja a kurzor Y-ját. Csak akkor
       görgetünk, ha a kurzor a nézeten KÍVÜL esik (ha látszik, nem ugrik). */
    const scrollCaretIntoView = useCallback((el: HTMLTextAreaElement) => {
        const cs = getComputedStyle(el);
        const mirror = document.createElement("div");
        /* A tükör betű- és padding-tulajdonságait a mezőéből másoljuk. KEBAB-alakú
           CSS-neveket használunk a getPropertyValue/setProperty párral, nem a
           camelCase style[p]-t: a CSSStyleDeclaration-nek NINCS string-index-
           szignatúrája, tehát a `mirror.style[p] = cs[p]` fordítási hiba volna. A
           kebab-nevek stringet várnak és stringet adnak, ellenőrzötten (nem `as`). */
        for (const p of ["font-family", "font-size", "font-weight", "font-style", "letter-spacing",
            "line-height", "text-transform", "word-spacing", "text-indent", "text-align",
            "padding-top", "padding-right", "padding-bottom", "padding-left"]) {
            mirror.style.setProperty(p, cs.getPropertyValue(p));
        }
        mirror.style.position = "absolute";
        mirror.style.left = "-9999px";
        mirror.style.top = "0";
        mirror.style.visibility = "hidden";
        mirror.style.whiteSpace = "pre-wrap";
        mirror.style.overflowWrap = "break-word";
        mirror.style.boxSizing = "border-box";
        mirror.style.width = el.clientWidth + "px";
        const pos = el.selectionEnd;
        mirror.textContent = el.value.slice(0, pos);
        const marker = document.createElement("span");
        marker.textContent = el.value.slice(pos) || ".";
        mirror.appendChild(marker);
        document.body.appendChild(mirror);
        const caretOffsetTop = marker.offsetTop;
        document.body.removeChild(mirror);

        const lineHeight = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.3;
        const rect = el.getBoundingClientRect();
        const caretTop = rect.top + window.scrollY + (parseFloat(cs.borderTopWidth) || 0) + caretOffsetTop;
        const caretBottom = caretTop + lineHeight;
        const pad = 24;
        if (caretBottom > window.scrollY + window.innerHeight) {
            window.scrollTo(0, Math.round(caretBottom - window.innerHeight + pad));
        } else if (caretTop < window.scrollY) {
            window.scrollTo(0, Math.max(0, Math.round(caretTop - pad)));
        }
    }, []);

    /* A hibabuborék elfelejtése — a buborékon kívüli kattintásra hívja a
       ValidationTooltip. Stabil (üres deps), mert a tooltip ebből köti a
       dokumentum-szintű figyelőjét. */
    const dismissValidation = useCallback(() => setValidation(null), []);

    const handleQuoteChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
        setQuote(event.target.value);
        setIsQuoteValid(event.target.value.trim().length > 0);
        setValidation(null);
        autoGrow(event.target);
    };

    /* Ctrl/Cmd+B: a KIJELÖLÉS félkövér BE/KI, a marker-stringen (a tiszta toggleBold
       végzi a döntést + a `**` átrendezését, l. bold.tsx). A mező sima <textarea>,
       tehát a `**` jelek látszanak; a nézetek renderelik félkövérnek. Telefonon a
       `**` kézzel is beírható. A kijelölést a render után állítjuk vissza. */
    const handleQuoteKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if ((event.ctrlKey || event.metaKey) && (event.key === "b" || event.key === "B")) {
            event.preventDefault();
            const el = textareaRef.current;
            if (!el) return;
            const result = toggleBold(quote, el.selectionStart, el.selectionEnd);
            setQuote(result.text);
            setIsQuoteValid(result.text.trim().length > 0);
            setValidation(null);
            pendingSelection.current = [result.selStart, result.selEnd];
        }
    };

    /* Betöltés/tartalomváltás után a magasságot igazítjuk (update-nél a betöltött,
       akár többsoros idézet így teljesen látszik, nem gördül), és ha a Ctrl+B
       kijelölés-visszaállítást kért, azt is elvégezzük — mindkettő a render UTÁN
       kell, amikor a textarea DOM-értéke már friss. */
    /* A textarea magasságát a TARTALOMHOZ igazítjuk — de SZÁNDÉKOSAN csak a szöveg
       (quote) változására és betöltéskor, a BETŰMÉRET váltására NEM. Betűméret-
       állításkor a mező mérete maradjon változatlan (ne ugráljon a modal, ne
       csússzanak el a gombok a kéz alól); a mező a betöltéskori méretében marad, a
       szöveg nő/zsugorodik benne. A betöltött idézet a mentett méretével kap helyet
       (ekkor a quote/isLoading váltás futtatja ezt az effektet). Ezért fontSize
       NINCS a függőségek közt.

       useLayoutEffect (nem useEffect): a magasság-igazítás a KIRAJZOLÁS ELŐTT fut le.
       Enélkül egy hosszú idézet megnyitásakor a mező előbb kis (rows=4) magassággal
       kirajzolódott — a Mentés/Törlés gombok FENT villantak fel (a piros Törlés
       zavaróan) —, majd az autoGrow a festés után megnövelte, és a gombok leugrottak.
       A layout-effekttel a mező már az első festéskor a végleges magasságú, így a
       gombok azonnal a helyükön (a szöveg után) jelennek meg, felvillanás nélkül. */
    useLayoutEffect(() => {
        if (isLoading) return;
        const el = textareaRef.current;
        if (!el) return;
        // Az autoGrow magától megőrzi a görgetést (nem ugrik az összecsukástól).
        autoGrow(el);
        if (pendingSelection.current) {
            const [s, e] = pendingSelection.current;
            // preventScroll: a fókusz NE görgesse a mezőt a képernyő tetejére; a
            // kurzort utána KÜLÖN görgetjük láthatóvá — pont mint gépeléskor.
            el.focus({preventScroll: true});
            el.setSelectionRange(s, e);
            pendingSelection.current = null;
            scrollCaretIntoView(el);
        }
    }, [quote, isLoading, autoGrow, scrollCaretIntoView]);


    /* A MENTENDŐ ADAT — mindhárom mentési útvonal (blocker, leváláskori mentés,
       autosave) PONTOSAN ezt küldi; csak a hívás KÖRÜLI viselkedés tér el (hova
       navigál, melyik tokent használja, mit tesz hibánál), ezért maga a mentés
       szándékosan NEM közös. Egy új mező (pl. címke) így egy helyen kerül be.

       A félkövér-markereket MENTÉSKOR normalizáljuk: a `**`-ok flip-flopját tiszta
       bold-futamokra oldjuk fel (a tárolt és a `loaded` érték is normalizált).

       useCallback: a blocker-effekt függőségi listájában ez az EGY érték áll a hat
       nyers state helyett, így az effekt csak akkor fut újra, ha a payload tényleg
       változhatott.

       AZ AZONOSÍTÓ MINDIG BEKERÜL — create-nél is: a szerver ebből ismeri fel a
       megismételt létrehozást (createOnce.js), és a végpont meg is követeli. */
    const buildPayload = useCallback((): QuotePayload => {
        const data: QuotePayload = {quote: normalizeBold(quote), author: author, order: order, fontSize: fontSize};
        if (savedItemId) data.id = savedItemId;
        return data;
    }, [quote, author, order, fontSize, savedItemId]);

    /* A NAVIGÁCIÓ-ELKAPÓ mentés magja: a blocker akkor billen "blocked"-ba, ha van
       mentenivaló ÉS navigálni próbálnak (Mentés, Escape, logó, "+", Vissza gomb,
       szekció-váltás). Ilyenkor: üres idézetnél hibabuborék + MARADÁS (reset), NEM
       enged tovább; érvényesnél MENT, majd a mentés BEFEJEZŐDÉSE UTÁN folytatja a
       blokkolt navigációt (proceed) — így a cél-lista friss. A blocker.proceed() a
       felhasználó EREDETI céljára navigál (a logó a listára, a "+" a create-re, a
       Vissza az előző oldalra), tehát nem kell külön kezelni az egyes linkeket. */
    useEffect(() => {
        if (blocker.state !== "blocked") { handledBlockRef.current = false; return; }
        if (handledBlockRef.current) return;
        handledBlockRef.current = true;

        // Megkezdett, de az idézet üres: a saját hibabuborékot mutatjuk, és maradunk.
        // A szerző OPCIONÁLIS, azt nem kérjük számon.
        // A hibaszöveg neve külön: a placeholder "Idézet szövege", az üzenet rövidebb
        // ("Az idézet kitöltése kötelező."); a pozíciót a placeholder szélessége adja.
        if (!isQuoteValid) { setValidation(fieldAnchor("#quoteField", "idézet")); blocker.reset(); return; }
        setValidation(null);

        // Innentől mentünk; a mentés sikeréig NEM navigálunk.
        markSaving(true);
        /* A BUKÁS ÁGA — l. a Todos/save.tsx azonos pontját. Három dolog: a felirat
           visszaáll "Mentés"-re (ez a visszajelzés), PISZKOZAT készül (különben egy
           későbbi eltűnés nyomtalanul vinné a szöveget), és a fókusz a Mentés gombra
           ugrik (a navigációval indított mentésnél ez az egyetlen látható jel). */
        const failSave = (error: unknown) => {
            markSaving(false);
            setSaveFailed(true);
            logRequestError(error);
            saveDraft(draftStorageKey, buildPayload(), loaded.current ?? undefined, savedItemId ?? undefined);
            blocker.reset();
        };
        /* A futó mentés ígérete (l. inFlightRef): a `settled` a promise saját
           resolve-ja, amit a konstruktor SZINKRON törzse állít be. Így a
           kijelentkezés megvárja ezt a mentést, másodikat nem indítva mellé. */
        let settled: () => void = () => undefined;
        inFlightRef.current = new Promise<void>((resolve) => { settled = resolve; });
        handleAxios(url, buildPayload(), (response) => {
            settled();
            if (response.status !== 200) return failSave(new Error("HTTP " + response.status));
            // A tartalom a szerveren van: a helyi másolat okafogyott.
            clearDraft(draftStorageKey);
            props.handleLinkClicked();
            /* A SORREND KÖTÖTT: előbb a mentés-állapot lezárása és a "megyünk" jelző,
               csak azután a proceed() — fordítva a shouldBlock a saját folytatásunkat
               blokkolná. */
            markSaving(false);
            leftViaForm.current = true;
            blocker.proceed();
        }, (error) => { settled(); failSave(error); });
    }, [blocker, isQuoteValid, buildPayload, url, handleAxios, props, draftStorageKey, markSaving,
        savedItemId]);

    /* A BUKÁS UTÁN A MENTÉS GOMBRA KERÜL A FÓKUSZ — a részletes indoklás a
       Todos/save.tsx azonos effektjénél. Külön effekt, mert a gomb a mentés alatt
       `disabled`, és arra nem lehet fókuszt tenni: ez az újrarajzolás után fut. */
    useEffect(() => {
        if (!saveFailed) return;
        const button = formRef.current?.querySelector("#" + SAVE_BUTTON_ID);
        if (button instanceof HTMLElement) button.focus();
    }, [saveFailed]);

    /* A Mentés gomb (és az Escape) már csak NAVIGÁL — az ellenőrzést+mentést a
       fenti blocker intézi, ha van mentenivaló. Érintetlen űrlapnál a blocker nem
       blokkol, tehát egyszerűen visszalépünk. */
    const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        leaveEditor();
    }, [leaveEditor]);

    /* A LEVÁLÁSKORI (unmount) mentés — a KIJELENTKEZÉSre (removeCookie), ami NEM
       router-navigáció, hanem React-újrarender: a blocker nem látja. A blocker
       ellenőrzése (üres idézet → hibabuborék + MARADÁS) itt SZÁNDÉKOSAN nem fut le,
       és nem is kell: kijelentkezéskor nincs hova "maradni", és nincs kinek visszajelezni.
       Csak CSENDES mentés történik — a mentendő értékekre ugyanaz a szűrő, mint a
       blockernél: ha az idézet érvényes ÉS változott a tartalom, elmentjük; ha
       érvénytelen (üres idézet) vagy érintetlen, ELDOBJUK. És ha a blocker/Törlés már
       elintézte a távozást (leftViaForm), itt sem mentünk (nehogy duplán).

       A closure-t minden renderben frissítjük, hogy az unmount a LEGFRISSEBB állapotot
       mentse — és hogy a legutóbbi render (még érvényes) `token`-jét zárványolja: a
       kijelentkezés a hívás pillanatára már törli az ÉLŐ tokent, ezért azt EXPLICIT
       átadjuk a handleAxios-nak, különben a mentés token nélkül, 401-gyel elveszne.

       A KÉZI kijelentkezés (gomb) BÁRMIKOR jöhet, érvényes tokennel (a user épp aktív) —
       ezt a zárványolt token őrzi meg. A TÉTLENSÉGI (timeout) ágat külön a 10 perces
       autosave fedi le (l. lentebb): az még érvényes tokennel ment és a listára navigál,
       tehát 15 percnél már nincs mentetlen szerkesztő. (Kivétel: ha az autosave hálózati
       hibán elbukik, marad az eredeti korlát — 15 percnél a token lejárt, nem menthető.) */
    saveOnLeaveRef.current = () => {
        // Már fut egy mentés: azt VÁRATJUK meg a kijelentkezéssel (l. inFlightRef).
        if (savingRef.current && inFlightRef.current) return inFlightRef.current;
        if (!hasSilentWork()) return Promise.resolve();
        /* A mentés MEGKEZDÉSE előtt jelöljük, hogy elintéztük a távozást: a
           kijelentkezés MEGVÁRJA ezt a mentést (pendingSave.ts), és a rákövetkező
           leválás már nem indíthat még egyet — create-nél az duplikálna. */
        leftViaForm.current = true;
        /* A LEVÁLÁSKORI MENTÉS a legkockázatosabb út: a képernyő épp megszűnik,
           tehát ha ez elbukik (lejárt token, alvó szerver, megszakadt hálózat),
           NINCS kinek szólni — a beírt szöveg nyomtalanul elveszne. Ezért a
           hibaágon PISZKOZATOT írunk a böngésző tárolójába, és a szerkesztő
           legközelebbi megnyitásakor magától visszaáll (l. drafts.ts). */
        /* ÚJRAPRÓBÁLÁS a piszkozat ELŐTT: a bukások nagy része múló (wifi-váltás,
           épp újrainduló szerver), és arra a helyes válasz még egy próba, nem egy
           visszaállított piszkozat a következő megnyitáskor (l. saveRetry.ts).
           A zárványolt `token` (nem az élő tokenRef): kijelentkezéskor az élő már null. */
        return saveWithRetry(
            (onSuccess, onFailure) => handleAxios(url, buildPayload(), () => {
                clearDraft(draftStorageKey);
                onSuccess();
            }, onFailure, token),
            (error) => {
                // Feladtuk: egy későbbi távozás újrapróbálhatja, a szöveg a piszkozatban.
                leftViaForm.current = false;
                logRequestError(error);
                saveDraft(draftStorageKey, buildPayload(), loaded.current ?? undefined, savedItemId ?? undefined);
            });
    };

    /* A LAP BEZÁRÁSA (fül, böngésző) — itt a MENTÉSRE már nincs idő.

       A böngésző a lap eltűnésekor eldobja a függő kéréseket, és megállítani sem
       tudjuk: az újrapróbálás (saveRetry) második-harmadik köre biztosan nem fut
       le. Ezért itt NEM mentést indítunk, hanem AZONNAL kiírjuk a piszkozatot —
       az localStorage-írás, tehát szinkron, még a bezárás előtt megtörténik.

       Ha közben mégis átment egy mentés, az a piszkozatot úgyis törli; ha nem, a
       szöveg megmarad, és a szerkesztő legközelebbi megnyitásakor magától
       visszaáll (l. drafts.ts). Fölösleges piszkozat így legfeljebb egy marad,
       adat viszont nem vész el. */
    useEffect(() => {
        const keepWork = () => {
            if (!hasSilentWork()) return;
            saveDraft(draftStorageKey, buildPayload(), loaded.current ?? undefined, savedItemId ?? undefined);
        };
        window.addEventListener("beforeunload", keepWork);
        return () => window.removeEventListener("beforeunload", keepWork);
    });

    /* A KIJELENTKEZÉS MEGVÁRJA ezt a mentést. A ref-en át megy, hogy mindig a
       LEGFRISSEBB állapotot mentse (a regisztráció egyszer fut, mountkor). */
    useEffect(() => registerPendingSave(() => saveOnLeaveRef.current()), []);

    // A fenti mentés a szerkesztő LEVÁLÁSAKOR (kézi kijelentkezés) fut le, egyszer.
    /* A cleanup NEM adhatja tovább a promise-t: a React a visszatérési értéket
       takarító függvénynek nézné. A `void` kimondja, hogy itt nem várunk rá — a
       leválás pillanatában már úgyis nincs kinek visszajelezni; a kijelentkezés
       ága az, ami MEGVÁRJA (l. pendingSave.ts). */
    useEffect(() => () => { void saveOnLeaveRef.current(); }, []);

    /* Az AUTOSAVE (tétlenség után) — mint a leváláskori mentés, de siker UTÁN a listára
       navigál (kilép a szerkesztőből). Az órát a közös useIdleTimer adja: minden
       aktivitás újraindítja, tehát gépelés közben sosem sül el, és az auth 15 perces
       óráját sem érinti (sem itt, sem a mentés utáni navigációnál nincs /refresh).
       A mentés az ÉLŐ tokennel megy (10 percnél még érvényes), zárványolt itt nem kell. */
    useIdleTimer(() => {
        // Nincs mentenivaló (érintetlen vagy érvénytelen): NEM navigálunk el — hagyjuk a
        // felhasználót, a 15 perces tétlenségi kijelentkezés majd a szokott módon jön.
        if (!hasSilentWork()) return;
        /* AZ AUTOSAVE UGYANÚGY VISELKEDIK, MINT A KÉZI MENTÉS (a user döntése):
           "Mentés…" felirat, tiltott gombok, blokkolt navigáció. Hogy nem ő indította,
           nem érv a némaság mellett — az volna baj, ha közben elveszne a munkája. */
        markSaving(true);
        // Az autosave ígérete is a kijelentkezésnek szól (l. inFlightRef).
        let settled: () => void = () => undefined;
        inFlightRef.current = new Promise<void>((resolve) => { settled = resolve; });
        handleAxios(url, buildPayload(), () => {
            settled();
            clearDraft(draftStorageKey);
            props.handleLinkClicked();
            /* A SORREND ITT A LEGKÉNYESEBB: az autosave a SAJÁT navigációját is
               blokkolná, ha előbb nem zárnánk le a mentés-állapotot. A blocker
               reset()-je azért kell, mert közben a felhasználó megpróbálhatott
               navigálni (a kísérletét elnyeltük) — a függő blokkolt állapotot fel
               kell oldani, mielőtt mi navigálunk. */
            markSaving(false);
            leftViaForm.current = true;
            if (blocker.state === "blocked") blocker.reset();
            void navigate(PATHS.quotes);
        }, (error) => {
            settled();
            markSaving(false);
            setSaveFailed(true);
            if (blocker.state === "blocked") blocker.reset();
            logRequestError(error);
            /* Az autosave bukása után a szerkesztő MEGMARAD (nem navigálunk), tehát
               a szöveg még a képernyőn van — de a 15 perces tétlenségi kijelentkezés
               már a lejárt tokennel érné, ahonnan nincs mentés. A piszkozat ezt a
               rést fedi le. */
            saveDraft(draftStorageKey, buildPayload(), loaded.current ?? undefined, savedItemId ?? undefined);
        });
    });

    // A betöltő spinner az isLoading-ig; a `lastOrder === null` ág vele EGYÜTT igaz
    // (az isLoading csak a sorszám-korlát beérkezte után lesz false), de kimondva a
    // fordítónak is: innentől a lastOrder number, így az Order `last`-ja nem number|null.
    if (loadFailed) return (
        <LoadFailedNotice message="Hiba az oldal betöltése közben."
                          onRetry={() => { setLoadFailed(false); setRetryCount((count) => count + 1); }}/>
    );
    if (isLoading || lastOrder === null) return <Spinner class="min-vh-75"/>;

    return (
        <form ref={formRef} noValidate onSubmit={handleSubmit}
              className={"col-11 col-sm-10 col-md-8 col-lg-7 col-xl-6 card mx-auto mt-3 " +
                  "bg-transparent border-2 border-" + color}>

            <div className="input-group">
                {/* Sima textarea: a `**` jelek látszanak szerkesztés közben, a
                    nézetek renderelik félkövérnek. Ctrl+B a kijelölésen kapcsol
                    (okos toggle, l. bold.tsx); telefonon a `**` kézzel is
                    beírható. A magasság a tartalomhoz nő, scrollbar nélkül
                    (autoGrow). A rows=4 az alsó korlát. */}
                <textarea ref={textareaRef} id="quoteField" value={quote} onChange={handleQuoteChange}
                          onKeyDown={handleQuoteKeyDown}
                          placeholder="Idézet szövege" rows={4} autoFocus
                          style={{"--quote-fs": fontSize + "%"}}
                          className={"form-control card-header caveat no-focus bg-transparent ms-1 text-" + color}/>
                {/* A szövegmező MELLETT (nem alatta) egy jobbra igazított oszlop:
                    legfelül a sorszám-léptető, LEGALUL a megosztás-gomb. A
                    justify-content-between nyomja az ikont a sor aljára, így
                    közvetlenül a card-body első sorában ülő BETŰMÉRET-léptető
                    FÖLÉ kerül (a két léptető közé), miközben végig a szövegmező
                    mellett marad. A pe-2 a léptetőével azonos jobb térköz, tehát
                    az ikon pontosan a "+" gombok fölé esik. A flex-shrink-0 kell,
                    hogy az oszlop telefonon se zsugorodjon a szövegmező javára.

                    Az editor-side-column NEM dísz-osztály: az index.css ebből
                    tudja, hogy a card jobb felső ívét most az oszlop ELSŐ eleme
                    (a sorszám-toolbar) örökölje — enélkül a fekete hátterű
                    toolbar szögletes sarka kitakarná a card lekerekítését. */}
                <div className="editor-side-column d-flex flex-column align-items-end justify-content-between flex-shrink-0">
                    <Order current={order} setOrder={setOrder} last={lastOrder}/>
                    {/* Csak update-nél: a publikus cím az idézet azonosítójára
                        épül, ami create-nél még nem létezik. A quoteId truthy-
                        vizsgálata egyben szűkít is (string | null → string), így a
                        ShareButton a szigorú `Id` propját kapja meg. */}
                    {/* Nincs alsó térköz (pb): az ikon a sor legaljára ül, hogy
                        minél közelebb legyen az alatta következő betűméret-"+"-hoz.
                        A pe-2 marad, az adja a "+" gombokkal EGY VONALBA eső jobb szélt. */}
                    {isUpdate && quoteId && <div className="pe-2 text-theme">
                        <ShareButton author={author} quoteId={quoteId}/>
                    </div>}
                </div>
            </div>

            {/* pb-3 (nem py-1): a legalsó gomb — create-nél a "Mentés",
                update-nél a "Törlés" — alatt nagyobb levegő a card aljáig. */}
            <div className="card-body pt-1 pb-3">
                {/* A szerző-mező és a "Betűméret"-stepper egy sorban — a stepper a
                    sorszám-választó (Order) 1:1 mása: a léptetés (egyesével,
                    nyomva tartva ismételve) is azonos, csak a tartomány más
                    (100–200%), "Betűméret" tooltippel FELFELÉ, és külön tooltip-id-vel
                    (egy oldalon a sorszám ÉS a betűméret is stepper). */}
                {/* flex-nowrap: a Szerző-mező és a stepper egy sorban maradjon
                    telefonon is (a Bootstrap input-group alapból sort tördel). A
                    zsugoríthatóságot a Szerző-mező wrapper minWidth:0-ja adja.
                    width: calc(100% + 1rem): a card-body jobb paddingján (1rem) TÚLnyújtja
                    a sort JOBBRA, így a stepper jobb széle a sorszám-sor stepperével EGY
                    VONALBA kerül (mindkettő pe-2 = azonos táv a modal szélétől; headless
                    méréssel igazolva: 10px = 10px). A sorszám-sor a formban ül (nincs
                    card-body padding), ezért volt kijjebb. (Negatív margó nem elég: a
                    Bootstrap .input-group width:100%, azon a margó nem tolja a jobb szélt;
                    a Bootstrap negatív margó-utility-ket meg alapból nem is generál.) */}
                <div className="input-group flex-nowrap" style={{width: "calc(100% + 1rem)"}}>
                    <AuthorInput value={author} onChange={(event) => setAuthor(event.target.value)}
                                 placeholder="Szerző" class={"caveat ps-2 text-" + color}/>
                    <Order current={fontSize} setOrder={setFontSize} max={200} min={100}
                           stepDelay={STEP_DELAY_MS / 2}
                           tooltip="Betűméret" tooltipPlace="top" tooltipId="fontsize-tooltip"/>
                </div>

                <div className="d-grid">
                    {/* A gomb TILTOTT, amíg a kötelező mező (az idézet szövege) üres —
                        pontosan a to-do mintájára (Todos/save.tsx: isTitleValid &&
                        isCategoryValid). A szerző OPCIONÁLIS, azt nem kérjük számon.
                        A blocker üres-idézet ága ettől NEM válik feleslegessé: a logó,
                        a "+", a Vissza gomb és a szekció-váltó továbbra is elindíthat
                        navigációt üres mezővel — ott a hibabuborék + maradás jár.

                        A FELIRAT "Mentés" (nem "Tovább"), mentés közben "Mentés…", és
                        a gomb ilyenkor tiltott — l. a Todos/save.tsx azonos pontját. */}
                    <SubmitButton id={SAVE_BUTTON_ID} isDisabled={!isQuoteValid || isSaving} isOutline={false}
                                  color={color} text={isSaving ? "Mentés…" : "Mentés"}/>

                    {isUpdate &&
                        /* A TÖRLÉS IS TILTOTT MENTÉS KÖZBEN (l. Todos/save.tsx). */
                        <DeleteAndModal handleLinkClicked={props.handleLinkClicked} color={color}
                                        deleteUrl={ENDPOINTS.quoteDelete} listUrl={PATHS.quotes} itemId={quoteId}
                                        isDisabled={isSaving}
                                        onDelete={() => { leftViaForm.current = true; }}/>}
                </div>
            </div>

            {/* Kötelező-mező hibabuborék (l. Editor/validationTooltip). Külön id,
                mert a to-do szerkesztőé is él a lapon — az id-ütközést a
                react-tooltip nem tűrné. Az onDismiss a buborékon KÍVÜLI
                kattintásra felejti el a hibát (a buborék így nem ragad a
                képernyőn, ha a felhasználó nem gépel tovább). */}
            <ValidationTooltip id="quote-validation-tooltip" validation={validation}
                               onDismiss={dismissValidation}/>

        </form>
    );
}
