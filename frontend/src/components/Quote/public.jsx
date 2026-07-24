import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import Spinner from "../spinner";
import {useAuth} from "../../contexts/auth";
import {useTheme} from "../../contexts/theme";
import {renderBold} from "./bold";
import {logRequestError} from "../../log";

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
    const [quote, setQuote] = useState();
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        handleAxios("/quotes/id", {id}, (response) => setQuote(response.data),
            (error) => {
                logRequestError(error);
                setNotFound(true);
            });
    }, [id, handleAxios]);

    if (notFound) return <div className={"text-center mt-5 caveat text-" + color}>Nem létező idézet.</div>;
    if (!quote) return <Spinner class="min-vh-75"/>;

    return (
        <div className={"col-11 col-sm-10 col-md-8 col-lg-7 col-xl-6 card mx-auto mt-3 " +
            "bg-transparent border-2 border-" + color}>
            {/* A törzsszöveg BALRA zárt (mint a szerkesztőben); a szerző marad
                középen (l. a card-footer text-center-jét). */}
            <div className={"card-body caveat text-start px-4 py-4 text-" + color}
                 style={{fontSize: "170%", whiteSpace: "pre-wrap"}}>
                {renderBold(quote.quote)}
            </div>
            {quote.author &&
                <div className={"card-footer caveat text-center bg-transparent border-0 pb-3 text-" + color}>
                    {quote.author}
                </div>}
        </div>
    );
}
