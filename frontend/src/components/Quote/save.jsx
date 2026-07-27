import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import {useBlocker, useLocation, useNavigate, useParams} from "react-router-dom";
import Spinner from "../spinner";
import SubmitButton from "../Button/submitButton";
import AuthorInput from "./authorInput";
import Order, {STEP_DELAY_MS} from "../Todo/order";
import DeleteAndModal from "../Todo/deleteAndModal";
import {toggleBold, normalizeBold} from "./bold";
import {useAuth} from "../../contexts/auth-context";
import {useTheme} from "../../contexts/theme-context";
import {logRequestError} from "../../log";
import {Tooltip as ReactTooltip} from "react-tooltip";

/* Az új idézet alap betűmérete SZÁZALÉKBAN — szándékosan a Szerző-mező méretével
   egyezik (a .caveat szabály 155%-a), hogy a szerkesztőben az idézet és a szerző
   egy méretűnek induljon, és a lista is így mutassa. A "Betűméret"-stepperrel
   idézetenként átállítható; a mező nélküli régi idézetek is ekkorák. */
const DEFAULT_FONT_SIZE = 155;

/* Az idézet-szerkesztő (create és update). A to-do save.jsx VÉKONYABB mása: az
   idézet-textarea + szerző-input + a KÖZÖS Order sorszám-választó (a to-doból),
   de nincs szín, listaelem vagy százalék. A KILÉPÉS-viselkedést a to-do mintája
   adja: a Tovább gomb / Escape a formot süti el, majd navigál; a navigációt
   (Tovább, Escape, logó, "+", Vissza gomb, szekció-váltás) a useBlocker kapja el,
   és amíg van mentenivaló, előbb ELLENŐRIZ + MENT, csak utána enged tovább
   (üres idézetnél hibabuborék + maradás). A törlést a paraméterezett DeleteAndModal
   intézi (a /quotes/delete végponttal, vissza a /quotes-ra). */
export default function QuoteSave(props) {
    const [quote, setQuote] = useState("");
    const [author, setAuthor] = useState("");
    const [isQuoteValid, setIsQuoteValid] = useState(false);
    // Az Order kezdőértéke 1 — pontosan a to-do mintájára: create-nél az új idézet
    // alapból a lista ELEJÉRE kerül (1), onnan léptethető lejjebb.
    const [order, setOrder] = useState(1);
    const [lastOrder, setLastOrder] = useState(null);
    // Per-idézet betűméret SZÁZALÉKBAN. Create-nél az alap a Szerző mezőével egyező
    // DEFAULT_FONT_SIZE, update-nél a betöltött érték. A "Betűméret" stepper állítja;
    // a nézetek a --quote-fs CSS-változón át rajzolják ekkorára az idézetet.
    const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
    const [isLoading, setIsLoading] = useState(true);
    const [validation, setValidation] = useState(null);
    const {id} = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const {handleAxios, token} = useAuth();
    const {color} = useTheme();
    const formRef = useRef(null);
    const textareaRef = useRef(null);
    // A Ctrl+B utáni kijelölést a render UTÁN állítjuk vissza (a setQuote
    // újrarajzol, előbb a DOM-értéknek frissülnie kell) — ide tesszük a [start,end]-t.
    const pendingSelection = useRef(null);
    const loaded = useRef(null);
    /* Igaz, ha a mentés MÁR elintézte a távozást (a blocker mentés+proceed ága, vagy a
       Törlés) — ilyenkor a leváláskori (unmount) mentés NEM fut le újra (create-nél
       nehogy duplán hozzon létre). A blocker shouldBlock-ja is ezt nézi: ha igaz, nem
       blokkol (a törlés-navigáció és a már-elintézett proceed szabadon átmehet). */
    const leftViaForm = useRef(false);
    /* A leváláskor futtatandó mentés legfrissebb változata — minden renderben
       frissül, hogy az unmount az aktuális állapotot mentse (l. lentebb). */
    const saveOnLeaveRef = useRef(() => {});
    /* A "van-e mentenivaló?" (dirty) legfrissebb értéke — a useBlocker shouldBlock-ja
       ref-ből olvassa, hogy stabil (üres deps) függvény lehessen, mégis a friss
       állapotot lássa. */
    const isDirtyRef = useRef(false);
    /* Egy blokkolt navigációt EGYSZER dolgozunk fel — a StrictMode (dev) kétszer
       futtatja az effekteket, enélkül a mentés duplázódna. */
    const handledBlockRef = useRef(false);

    const isUpdate = Boolean(props.isUpdate);
    const url = isUpdate ? "/quotes/update" : "/quotes/create";
    /* Az azonosító az URL /update/:id szegmenséből jön. A route-ban a :id kötelező,
       tehát update-nél mindig megvan; a csupasz /update-et a "*"-ág fogja el, ide
       nem jut. Create-nél nincs szerkesztett elem: null. */
    const quoteId = isUpdate ? id : null;

    /* Változatlan-e a szerkesztő ahhoz képest, amit menteni érdemes? Create-nél:
       üres (se idézet, se szerző) — ilyenkor nincs mentenivaló. Update-nél: a
       betöltöttel egyező tartalom (a mentés updatedAt-et is írna, tehát egy üres
       "Tovább" hazudná, hogy hozzányúltunk). Ha még nincs betöltve (loaded null:
       betöltés alatt vagy hiba után), szintén pristine — nincs mit menteni, és a
       betöltés-hiba leaveEditor()-ja se akadjon a blockerbe. */
    const isPristine = (cleanedQuote) => {
        if (isUpdate) {
            if (loaded.current == null) return true;
            return cleanedQuote === loaded.current.quote && author === loaded.current.author
                && order === loaded.current.order && fontSize === loaded.current.fontSize;
        }
        return !quote.trim() && !author.trim();
    };
    isDirtyRef.current = !isPristine(normalizeBold(quote));

    /* A useBlocker DATA ROUTERT kér (l. routes.jsx). shouldBlock: akkor blokkoljuk a
       navigációt, ha van mentenivaló (dirty) ÉS nem a mentés/törlés maga navigál
       (leftViaForm). A függvény üres deps-szel stabil, de refekből olvas, így a friss
       állapotot látja — a react-router így nem regisztrálja újra minden rendernél. */
    const shouldBlock = useCallback(() => !leftViaForm.current && isDirtyRef.current, []);
    const blocker = useBlocker(shouldBlock);

    /* Kilépés a szerkesztőből: update esetén VISSZA oda, ahonnan indult (a
       böngésző-előzményből), közvetlen link/F5 esetén (nincs app-előzmény) a
       listára; create után mindig a listára. A navigációt a blocker kapja el, ha
       van mentenivaló — ez indítja a mentést. */
    const leaveEditor = useCallback(() => {
        if (isUpdate && location.key !== "default") navigate(-1);
        else navigate("/quotes");
    }, [isUpdate, location.key, navigate]);

    useEffect(() => {
        if (quoteId) {
            // A szerkesztő betöltése a HITELESÍTETT /quotes/edit-ről megy (nem a
            // publikus /quotes/id-ról): innen jön a sorszám is, tulajdonos-
            // ellenőrzés mögött. Idegen/törölt idézetnél 403 → leaveEditor.
            handleAxios("/quotes/edit", {id: quoteId}, (response) => {
                const q = response.data;
                setQuote(q.quote);
                setAuthor(q.author ?? "");
                setOrder(q.order);
                setFontSize(q.fontSize ?? DEFAULT_FONT_SIZE);
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
                    fontSize: q.fontSize ?? DEFAULT_FONT_SIZE};
            }, (error) => {
                // Nem tölthető be (törölt elem vagy timeout) — vissza a listához,
                // hogy a betöltő ne pörögjön örökké.
                logRequestError(error);
                leaveEditor();
            });
        }
        /* Az Order felső korlátja PONTOSAN a to-do mintáját követi (a viselkedés ne
           térjen el a to-dótól): create-nél az idézetek száma (N), update-nél N-1 —
           a szerkesztett elem a saját helyén már bent van, tehát a többiek közé
           tolható. Üres listánál 0. */
        handleAxios("/quotes/last/order", {}, (response) => {
            const last = response.data;
            setLastOrder(last === 0 ? 0 : (isUpdate ? last - 1 : last));
        }, logRequestError);
    }, [isUpdate, quoteId, handleAxios, leaveEditor]);

    /* A betöltő feloldása a to-do mintájára: create-nél amint a felső korlát
       megvan; update-nél amint a betöltött idézet is beérkezett (a tartalom
       megjelent). Külön effekt, mert az adat több válaszból áll össze. */
    useEffect(() => {
        if (lastOrder === null) return;
        if (isUpdate) {
            if (quote && isQuoteValid) setIsLoading(false);
        } else setIsLoading(false);
    }, [isUpdate, lastOrder, quote, isQuoteValid]);

    /* Escape = mentés + vissza, pontosan úgy, ahogy a "Tovább": a formot sütjük
       el (requestSubmit), így a handleSubmit ugyanúgy lefut (leaveEditor → a blocker
       ellenőriz+ment, ha kell). Kivétel: ha a törlés-modal nyitva van, az Escape
       AZT zárja (natív <dialog>). */
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
                formRef.current?.requestSubmit();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    /* A textarea magassága a TARTALOMHOZ nő, görgetősáv helyett (scrollbar tilos):
       előbb "auto"-ra állítjuk, hogy a böngésző a rows=4 alsó korláttal mérjen,
       majd a scrollHeight-re — az sosem kisebb a látható magasságnál, tehát rövid
       szövegnél a 4 sor marad, hosszúnál soronként magasodik.

       A "auto" pillanatra ÖSSZECSUKJA a mezőt (a lap magassága változik), amitől a
       böngésző elgörgethet — ez okozta, hogy gépelés/Ctrl+B közben a lap felugrott
       vagy a sort a képernyő aljára tolta. Ezért a lap görgetési pozícióját
       elmentjük az átméretezés ELŐTT, és utána visszaállítjuk: az editor nem ugrál. */
    const autoGrow = useCallback((el) => {
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
    const scrollCaretIntoView = useCallback((el) => {
        const cs = getComputedStyle(el);
        const mirror = document.createElement("div");
        for (const p of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing",
            "lineHeight", "textTransform", "wordSpacing", "textIndent", "textAlign",
            "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) mirror.style[p] = cs[p];
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

    const handleQuoteChange = (event) => {
        setQuote(event.target.value);
        setIsQuoteValid(event.target.value.trim().length > 0);
        setValidation(null);
        autoGrow(event.target);
    };

    /* Ctrl/Cmd+B: a KIJELÖLÉS félkövér BE/KI, a marker-stringen (a tiszta toggleBold
       végzi a döntést + a `**` átrendezését, l. bold.jsx). A mező sima <textarea>,
       tehát a `**` jelek látszanak; a nézetek renderelik félkövérnek. Telefonon a
       `**` kézzel is beírható. A kijelölést a render után állítjuk vissza. */
    const handleQuoteKeyDown = (event) => {
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
       kirajzolódott — a Tovább/Törlés gombok FENT villantak fel (a piros Törlés
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


    /* A hibabuborékot a mező placeholderének KÖZEPÉRE horgonyozzuk: a szöveg
       félszélességét a mező saját fontjával mérjük (canvas), a bal/felső padding
       után. Így a buborék nyila a placeholder alá esik, nem a nagy mező közepére. */
    const fieldOf = (selector, name) => {
        const el = document.querySelector(selector);
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const ctx = document.createElement("canvas").getContext("2d");
        ctx.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
        const half = ctx.measureText(el.placeholder).width / 2;
        return {
            // A hibaszöveg NEVE külön adható meg: a placeholder "Idézet szövege",
            // de az üzenet rövidebb ("Az idézet kitöltése kötelező."). A pozíciót
            // továbbra is a placeholder szélessége adja.
            anchor: selector,
            name: name ?? el.placeholder.toLowerCase(),
            pos: {
                x: r.left + (parseFloat(cs.paddingLeft) || 0) + half,
                y: r.top + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.fontSize) || 16),
            },
        };
    };

    /* A NAVIGÁCIÓ-ELKAPÓ mentés magja: a blocker akkor billen "blocked"-ba, ha van
       mentenivaló ÉS navigálni próbálnak (Tovább, Escape, logó, "+", Vissza gomb,
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
        if (!isQuoteValid) { setValidation(fieldOf("#quoteField", "idézet")); blocker.reset(); return; }
        setValidation(null);

        // Innentől mentünk; a mentés sikeréig NEM navigálunk. leftViaForm: az unmount-
        // mentés már ne fusson újra a proceed utáni leváláskor.
        leftViaForm.current = true;
        // A félkövér-markereket MENTÉSKOR normalizáljuk: a `**`-ok flip-flopját tiszta
        // bold-futamokra oldjuk fel (a tárolt/loaded érték is normalizált).
        const data = {quote: normalizeBold(quote), author: author, order: order, fontSize: fontSize};
        if (isUpdate) data["id"] = quoteId;
        handleAxios(url, data, (response) => {
            if (response.status === 200) { props.handleLinkClicked(); blocker.proceed(); }
            else { leftViaForm.current = false; blocker.reset(); }
        }, (error) => {
            // A mentés elbukott: maradunk (reset), és egy későbbi távozás újrapróbálja.
            leftViaForm.current = false;
            logRequestError(error);
            blocker.reset();
        });
    }, [blocker, isQuoteValid, quote, author, order, fontSize, isUpdate, quoteId, url, handleAxios, props]);

    /* A Tovább gomb (és az Escape) már csak NAVIGÁL — az ellenőrzést+mentést a
       fenti blocker intézi, ha van mentenivaló. Érintetlen űrlapnál a blocker nem
       blokkol, tehát egyszerűen visszalépünk. */
    const handleSubmit = useCallback((event) => {
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

       Korlát: a TÉTLENSÉGI kijelentkezésnél a token lejárat MIATT szűnik meg (a 15
       perces határ = a token élettartama), tehát ott a zárványolt token is lejárt —
       az a mentés nem menthető meg. A KÉZI kijelentkezés (gomb) érvényes tokennel
       történik, azt ez a mentés megőrzi. */
    saveOnLeaveRef.current = () => {
        if (leftViaForm.current) return;
        const cleanedQuote = normalizeBold(quote);
        if (isPristine(cleanedQuote) || !isQuoteValid) return;
        const data = {quote: cleanedQuote, author: author, order: order, fontSize: fontSize};
        if (isUpdate) data["id"] = quoteId;
        // A zárványolt `token` (nem az élő tokenRef): kijelentkezéskor az élő már null.
        handleAxios(url, data, () => {}, logRequestError, token);
    };

    // A fenti mentés a szerkesztő LEVÁLÁSAKOR (kézi kijelentkezés) fut le, egyszer.
    useEffect(() => () => saveOnLeaveRef.current(), []);

    return (
        isLoading ? <Spinner class="min-vh-75"/> :
            <form ref={formRef} noValidate onSubmit={handleSubmit}
                  className={"col-11 col-sm-10 col-md-8 col-lg-7 col-xl-6 card mx-auto mt-3 " +
                      "bg-transparent border-2 border-" + color}>

                <div className="input-group">
                    {/* Sima textarea: a `**` jelek látszanak szerkesztés közben, a
                        nézetek renderelik félkövérnek. Ctrl+B a kijelölésen kapcsol
                        (okos toggle, l. bold.jsx); telefonon a `**` kézzel is
                        beírható. A magasság a tartalomhoz nő, scrollbar nélkül
                        (autoGrow). A rows=4 az alsó korlát. */}
                    <textarea ref={textareaRef} id="quoteField" value={quote} onChange={handleQuoteChange}
                              onKeyDown={handleQuoteKeyDown}
                              placeholder="Idézet szövege" rows="4" autoFocus
                              style={{"--quote-fs": fontSize + "%"}}
                              className={"form-control card-header caveat no-focus bg-transparent ms-1 text-" + color}/>
                    <Order current={order} setOrder={setOrder} last={lastOrder} color={color}/>
                </div>

                {/* pb-3 (nem py-1): a legalsó gomb — create-nél a "Tovább",
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
                               color={color} tooltip="Betűméret" tooltipPlace="top" tooltipId="fontsize-tooltip"/>
                    </div>

                    <div className="d-grid">
                        <SubmitButton isDisabled={false} isOutline={false} color={color} text="Tovább"/>

                        {isUpdate &&
                            <DeleteAndModal handleLinkClicked={props.handleLinkClicked} color={color}
                                            deleteUrl="/quotes/delete" listUrl="/quotes" itemId={quoteId}
                                            onDelete={() => { leftViaForm.current = true; }}/>}
                    </div>
                </div>

                {/* Kötelező-mező hibabuborék a natív helyett, a "Sorszám" tooltip
                    stílusában; a placeholder közepére horgonyozva. A névelő a mezőnév
                    kezdőbetűjéből: magánhangzó → "Az" (pl. "Az idézet…"). */}
                <ReactTooltip id="quote-validation-tooltip" isOpen={validation !== null}
                              position={validation?.pos} place="bottom"
                              disableStyleInjection={true} border="1px solid var(--theme-accent)"
                              style={{zIndex: 20, backgroundColor: "var(--theme-page-bg)",
                                  color: "var(--theme-accent)"}}>
                    {validation &&
                        `${/^[aáeéiíoóöőuúüű]/i.test(validation.name) ? "Az" : "A"} ` +
                        `${validation.name} kitöltése kötelező.`}
                </ReactTooltip>

            </form>
    );
}
