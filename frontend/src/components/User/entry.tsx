import {useCallback, useEffect, useState, type ChangeEvent, type FormEvent} from "react";
import InputGroup from "./Form/Input/inputGroup";
import SubmitButtonGroup from "../Button/submitButtonGroup";
import {useAuth} from "../../contexts/auth-context";
import {logRequestError} from "../../log";
import {responseStatus} from "../../httpError";
import {ENTRY_ERROR_MESSAGES, entryError, type EntryError} from "./entryError";
import type {AuthToken} from "../../types/api";

/* Ugyanaz a komponens szolgálja ki a belépést és a regisztrációt — a különbséget
   EGYETLEN zászló hordozza, nem két majdnem egyforma fájl. */
type EntryProps = {
    isLogin: boolean;
};

export default function Entry(props: EntryProps) {
    /* A típus KIMONDVA, nem a `null` kezdőértékből következtetve — különben a
       fordító örökre `null`-ra szűkítené (l. CLAUDE.md, "kezdőérték ≠ típus"). */
    const [error, setError] = useState<EntryError | null>(null);
    const [name, setName] = useState("");
    const [isNameValid, setIsNameValid] = useState(false);
    const [password, setPassword] = useState("");
    const [isPasswordValid, setIsPasswordValid] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [isPasswordConfirmValid, setIsPasswordConfirmValid] = useState(false);
    const [isDisabled, setIsDisabled] = useState(true);
    const {login, handleAxios} = useAuth();
    // A props-ból csak az isLogin kell — a hookok függőségeiben ezt adjuk meg,
    // ne a teljes props objektumot (az minden rendernél új, a memózás így
    // hatástalan lenne).
    const {isLogin} = props;

    /* url és mb NEM state: a propból, illetve a hiba-állapotból egyértelműen
       adódnak. Korábban egy useEffect másolta őket state-be — ugyanaz a minta,
       ami a Save-ben a /update → /create váltást elrontotta: a másolat egy
       renderrel a prop mögött járt. Itt ráadásul az egész isLoading + Spinner
       csak azért létezett, hogy ezt az effektet megvárja; származtatva nincs
       mire várni, tehát az is elhagyható. */
    const url = isLogin ? "/login" : "/user/create";

    /* A jelszómező alatti térköz: hibaüzenetkor összébb húzódik, hogy a piros
       felirat elférjen. (A régi kód a beírás-kezelőkből mindig "mb-5"-öt tett
       ide, a signup induló "mb-3"-a helyett is — az első leütésre megugrott a
       lap. Származtatva ez a féloldalasság nem tud előfordulni.) */
    const mb = error ? "mb-4" : (isLogin ? "mb-5" : "mb-3");

    /* A hibafelirat a legelső leütésre eltűnik: aki javítani kezd, ne a régi
       hibaüzenetet nézze közben. Az `if` őr a fölösleges rendert spórolja meg. */
    const clearError = useCallback(() => setError(null), []);

    const handleNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        if (error) clearError();
        setName(event.target.value);
        setIsNameValid(event.target.value.length > 0);
    }, [error, clearError]);

    const handlePasswordChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        if (error) clearError();
        setPassword(event.target.value);
        if (isLogin) setIsPasswordValid(event.target.value.length >= 8);
        else {
            setIsPasswordValid(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/.test(event.target.value));
            setIsPasswordConfirmValid(event.target.value === passwordConfirm);
        }
    }, [error, clearError, isLogin, passwordConfirm]);

    const handlePasswordConfirmChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        if (error) clearError();
        setPasswordConfirm(event.target.value);
        setIsPasswordConfirmValid(event.target.value === password);
    }, [error, clearError, password]);

    const handleEyeClick = useCallback(() => setIsPasswordVisible(!isPasswordVisible), [isPasswordVisible]);

    useEffect(() => isLogin ? setIsDisabled(!(isNameValid && isPasswordValid)) :
            setIsDisabled(!(isNameValid && isPasswordValid && isPasswordConfirmValid)),
        [isLogin, isNameValid, isPasswordValid, isPasswordConfirmValid]);

    const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        /* A <AuthToken> megmondja, MIT várunk a szervertől: a válasz törzse maga az
           aláírt JWT, csupasz szövegként. Enélkül a `response.data` `unknown`
           volna, és a `login()` nem fogadná el — a típus-paraméter tehát nem
           díszítés, hanem itt dől el, hogy a szerződést betartjuk-e. */
        handleAxios<AuthToken>(url, {name: name, password: password}, (response) => {
                /* A süti beállítása átbillenti az isLoggedIn-t, a router
                   újrarenderel a belépett route-táblával — és MOST NEM navigálunk
                   kézzel: így ha a user login nélkül egy védett címet nyitott meg
                   (pl. /to-dos/update/:id vagy /quotes/:id), belépés után OTT marad,
                   nem dobjuk a főoldalra. A /login és /signup címeket a belépett
                   tábla "*" ága magától a /to-dos listára irányítja át. */
                login(response.data);
                /* A paraméter neve `requestError`, nem `error`: a komponens
                   állapotát hívják `error`-nak, és az árnyékolás itt pont a
                   fontos helyen zavarna össze (melyiket adjuk a naplónak?). */
            }, (requestError) => {
                logRequestError(requestError);
                /* A döntés STÁTUSZKÓDON áll, nem a hibaüzenet szövegén: a
                   szerver szerződése a kód (409 = névütközés), nem a mondat.
                   Korábban a "foglalt" szóra kerestünk rá az üzenetben — az
                   üzenet átfogalmazása vagy fordítása némán elrontotta volna ezt
                   az ágat, és semmi nem jelezte volna.

                   A hibaág paramétere `unknown` (JavaScriptben bármit el lehet
                   dobni), ezért nem lehet csak úgy `error.response?.status`-t írni.
                   A `responseStatus` VALÓDI alak-vizsgálatot végez (l. httpError.ts),
                   nem `as`-szal állítja, hogy Axios-hiba — így a tesztek sima
                   `{response:{status:409}}` objektuma is átmegy rajta.

                   Hogy melyik kódból melyik üzenet lesz, az az entryError.ts-ben
                   él, egyetlen táblázatban — itt csak azt mondjuk ki, hogy MINDEN
                   hiba kap választ. Ez a lényegi javítás: eddig a belépés minden
                   hibát rossz jelszónak mondott, a regisztráció pedig a 409-en
                   kívül semmit nem jelzett. */
                setError(entryError(isLogin, responseStatus(requestError)));
            }
        );
    }, [isLogin, url, name, password, login, handleAxios]);

    return (
        <div className="container-fluid d-flex justify-content-center align-items-center mt-4 pt-2 px-0">
            <form className={"col-10 col-sm-6 col-md-5 col-xl-3 text-theme-text"}
                  onSubmit={handleSubmit}>
                <InputGroup isLogin={isLogin} mb={mb} handleClick={handleEyeClick}
                            name={name} handleNameChange={handleNameChange}
                            isPasswordVisible={isPasswordVisible}
                            password={password} handlePasswordChange={handlePasswordChange}
                            passwordConfirm={passwordConfirm}
                            handlePasswordConfirmChange={handlePasswordConfirmChange}
                            errorMessage={error && ENTRY_ERROR_MESSAGES[error]}/>
                {/* A jelszó-ürítés a linkről elmaradhat: a routes.jsx külön key-t
                    ad a két nézetnek, így a váltás új példányt hoz, üres mezőkkel. */}
                <SubmitButtonGroup isDisabled={isDisabled} isLogin={isLogin}/>
            </form>
        </div>
    );
}
