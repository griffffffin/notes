import {useCallback, useEffect, useRef, useState} from "react";
import {Navigate, useLocation, useNavigate, useParams} from "react-router-dom";
import Spinner from "../spinner";
import SubmitButton from "../Button/submitButton";
import DeleteAndModal from "../Todo/deleteAndModal";
import {useAuth} from "../../contexts/auth";
import {useTheme} from "../../contexts/theme";
import {logRequestError} from "../../log";
import {Tooltip as ReactTooltip} from "react-tooltip";

/* Az idézet-szerkesztő (create és update). A to-do save.jsx VÉKONYABB mása: két
   mező (idézet-textarea + szerző-input), nincs szín, listaelem, százalék vagy
   sorszám-választó. A közös mentés-viselkedést a to-do mintája adja: az Escape a
   formot süti el ("Tovább"-ként), a hiányzó kötelező mezőnél saját hibabuborék,
   változatlan tartalomnál csak visszalépés. A törlést a paraméterezett
   DeleteAndModal intézi (a /quotes/delete végponttal, vissza a /quotes-ra). */
export default function QuoteSave(props) {
    const [quote, setQuote] = useState("");
    const [author, setAuthor] = useState("");
    const [isQuoteValid, setIsQuoteValid] = useState(false);
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [validation, setValidation] = useState(null);
    const {id} = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const {handleAxios} = useAuth();
    const {color} = useTheme();
    const formRef = useRef(null);
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
        if (isUpdate) {
            if (!quoteId) return;
            handleAxios("/quotes/id", {id: quoteId}, (response) => {
                const q = response.data;
                setQuote(q.quote);
                setAuthor(q.author ?? "");
                setOrder(q.order);
                setIsQuoteValid(Boolean(q.quote));
                loaded.current = {quote: q.quote, author: q.author ?? ""};
                setIsLoading(false);
            }, (error) => {
                // Nem tölthető be (törölt elem vagy timeout) — vissza a listához,
                // hogy a betöltő ne pörögjön örökké.
                logRequestError(error);
                leaveEditor();
            });
        } else {
            // Új idézet a lista VÉGÉRE: az utolsó sorszám + 1.
            handleAxios("/quotes/last/order", {}, (response) => {
                setOrder(response.data + 1);
                setIsLoading(false);
            }, logRequestError);
        }
    }, [isUpdate, quoteId, handleAxios, leaveEditor]);

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

    const handleQuoteChange = (event) => {
        setQuote(event.target.value);
        setIsQuoteValid(event.target.value.trim().length > 0);
        setValidation(null);
    };

    /* A hibabuborékot a mező placeholderének KÖZEPÉRE horgonyozzuk: a szöveg
       félszélességét a mező saját fontjával mérjük (canvas), a bal/felső padding
       után. Így a buborék nyila a placeholder alá esik, nem a nagy mező közepére. */
    const fieldOf = (selector) => {
        const el = document.querySelector(selector);
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const ctx = document.createElement("canvas").getContext("2d");
        ctx.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
        const half = ctx.measureText(el.placeholder).width / 2;
        return {
            anchor: selector,
            name: el.placeholder.toLowerCase(),
            pos: {
                x: r.left + (parseFloat(cs.paddingLeft) || 0) + half,
                y: r.top + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.fontSize) || 16),
            },
        };
    };

    const handleSubmit = useCallback((event) => {
        event.preventDefault();
        const data = {quote: quote, author: author, order: order};

        /* Változatlan-e a szerkesztő? Create-nél: üres (se idézet, se szerző) —
           ilyenkor csak elvetjük. Update-nél: a betöltöttel egyező tartalom (a
           mentés updatedAt-et is írna, tehát egy üres "Tovább" hazudná, hogy
           hozzányúltunk). */
        const pristine = isUpdate
            ? (loaded.current && quote === loaded.current.quote && author === loaded.current.author)
            : (!quote.trim() && !author.trim());
        if (pristine) {
            props.handleLinkClicked();
            leaveEditor();
            return;
        }

        // Megkezdett, de az idézet üres: a saját hibabuborékot mutatjuk, és nem
        // mentünk. A szerző OPCIONÁLIS, azt nem kérjük számon.
        if (!isQuoteValid) { setValidation(fieldOf("#quoteField")); return; }
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

                <textarea id="quoteField" value={quote} onChange={handleQuoteChange} placeholder="Idézet"
                          rows="4" autoFocus
                          className={"form-control card-header caveat no-focus bg-transparent ms-1 text-" + color}/>

                <div className="card-body py-1">
                    <input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Szerző"
                           autoComplete="off"
                           className={"form-control caveat no-focus bg-transparent ps-2 text-" + color}/>

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
