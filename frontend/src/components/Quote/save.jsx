import {useCallback, useEffect, useRef, useState} from "react";
import {Navigate, useLocation, useNavigate, useParams} from "react-router-dom";
import Spinner from "../spinner";
import SubmitButton from "../Button/submitButton";
import AuthorInput from "./authorInput";
import Order from "../Todo/order";
import DeleteAndModal from "../Todo/deleteAndModal";
import {toggleBold, normalizeBold} from "./bold";
import {useAuth} from "../../contexts/auth";
import {useTheme} from "../../contexts/theme";
import {logRequestError} from "../../log";
import {Tooltip as ReactTooltip} from "react-tooltip";

/* Az idézet-szerkesztő (create és update). A to-do save.jsx VÉKONYABB mása: az
   idézet-textarea + szerző-input + a KÖZÖS Order sorszám-választó (a to-doból),
   de nincs szín, listaelem vagy százalék. A közös mentés-viselkedést a to-do
   mintája adja: az Escape a
   formot süti el ("Tovább"-ként), a hiányzó kötelező mezőnél saját hibabuborék,
   változatlan tartalomnál csak visszalépés. A törlést a paraméterezett
   DeleteAndModal intézi (a /quotes/delete végponttal, vissza a /quotes-ra). */
export default function QuoteSave(props) {
    const [quote, setQuote] = useState("");
    const [author, setAuthor] = useState("");
    const [isQuoteValid, setIsQuoteValid] = useState(false);
    // Az Order kezdőértéke 1 — pontosan a to-do mintájára: create-nél az új idézet
    // alapból a lista ELEJÉRE kerül (1), onnan léptethető lejjebb.
    const [order, setOrder] = useState(1);
    const [lastOrder, setLastOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [validation, setValidation] = useState(null);
    const {id} = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const {handleAxios} = useAuth();
    const {color} = useTheme();
    const formRef = useRef(null);
    const textareaRef = useRef(null);
    // A Ctrl+B utáni kijelölést a render UTÁN állítjuk vissza (a setQuote
    // újrarajzol, előbb a DOM-értéknek frissülnie kell) — ide tesszük a [start,end]-t.
    const pendingSelection = useRef(null);
    const loaded = useRef(null);

    const isUpdate = Boolean(props.isUpdate);
    const url = isUpdate ? "/quotes/update" : "/quotes/create";
    const quoteId = isUpdate ? (id ?? null) : null;

    /* Kilépés a szerkesztőből: update esetén VISSZA oda, ahonnan indult (a
       böngésző-előzményből), közvetlen link/F5 esetén (nincs app-előzmény) a
       listára; create után mindig a listára. */
    const leaveEditor = useCallback(() => {
        if (isUpdate && location.key !== "default") navigate(-1);
        else navigate("/quotes");
    }, [isUpdate, location.key, navigate]);

    useEffect(() => {
        // Szerkesztés id nélkül: nincs mit betölteni, a render átirányít.
        if (isUpdate && !quoteId) return;
        if (quoteId) {
            handleAxios("/quotes/id", {id: quoteId}, (response) => {
                const q = response.data;
                setQuote(q.quote);
                setAuthor(q.author ?? "");
                setOrder(q.order);
                setIsQuoteValid(Boolean(q.quote));
                // A sorszám is része a "változott-e" ellenőrzésnek: az Order-választóval
                // a felhasználó a tartalom érintése nélkül is átsorolhatja az idézetet.
                loaded.current = {quote: q.quote, author: q.author ?? "", order: q.order};
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
       el (requestSubmit), így a handleSubmit minden ága ugyanúgy lefut. Kivétel:
       ha a törlés-modal nyitva van, az Escape AZT zárja (natív <dialog>). */
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
    useEffect(() => {
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

    const handleSubmit = useCallback((event) => {
        event.preventDefault();
        // A félkövér-markereket MENTÉSKOR normalizáljuk (a user kérése): a `**`-ok
        // flip-flopját tiszta bold-futamokra oldjuk fel, mielőtt tárolnánk. A tárolt
        // (loaded) érték is ilyen normalizált, ezért ehhez mérjük a "változott-e"-t.
        const cleanedQuote = normalizeBold(quote);
        const data = {quote: cleanedQuote, author: author, order: order};

        /* Változatlan-e a szerkesztő? Create-nél: üres (se idézet, se szerző) —
           ilyenkor csak elvetjük. Update-nél: a betöltöttel egyező tartalom (a
           mentés updatedAt-et is írna, tehát egy üres "Tovább" hazudná, hogy
           hozzányúltunk). */
        const pristine = isUpdate
            ? (loaded.current && cleanedQuote === loaded.current.quote && author === loaded.current.author
                && order === loaded.current.order)
            : (!quote.trim() && !author.trim());
        if (pristine) {
            props.handleLinkClicked();
            leaveEditor();
            return;
        }

        // Megkezdett, de az idézet üres: a saját hibabuborékot mutatjuk, és nem
        // mentünk. A szerző OPCIONÁLIS, azt nem kérjük számon.
        if (!isQuoteValid) { setValidation(fieldOf("#quoteField", "idézet")); return; }
        setValidation(null);

        if (isUpdate) data["id"] = quoteId;
        handleAxios(url, data, (response) => {
            if (response.status === 200) {
                props.handleLinkClicked();
                leaveEditor();
            }
        }, logRequestError);
    }, [quote, author, order, isUpdate, quoteId, url, leaveEditor, handleAxios, isQuoteValid, props]);

    // Szerkesztés id nélkül (közvetlen /update URL vagy F5) — nincs mit
    // szerkeszteni, vissza a listára. Minden hook FÖLÖTTE fut le.
    if (isUpdate && !quoteId) return <Navigate to="/quotes" replace/>;

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
                              className={"form-control card-header caveat no-focus bg-transparent ms-1 text-" + color}/>
                    <Order current={order} setOrder={setOrder} last={lastOrder} color={color}/>
                </div>

                {/* pb-3 (nem py-1): a legalsó gomb — create-nél a "Tovább",
                    update-nél a "Törlés" — alatt nagyobb levegő a card aljáig. */}
                <div className="card-body pt-1 pb-3">
                    <AuthorInput value={author} onChange={(event) => setAuthor(event.target.value)}
                                 placeholder="Szerző" class={"caveat ps-2 text-" + color}/>

                    <div className="d-grid">
                        <SubmitButton isDisabled={false} isOutline={false} color={color} text="Tovább"/>

                        {isUpdate &&
                            <DeleteAndModal handleLinkClicked={props.handleLinkClicked} color={color}
                                            deleteUrl="/quotes/delete" listUrl="/quotes" itemId={quoteId}/>}
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
