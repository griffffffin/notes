import {useCallback, useEffect, useState, type ChangeEvent, type FormEvent} from "react";
import InputGroup from "./Form/Input/inputGroup";
import SubmitButtonGroup from "../Button/submitButtonGroup";
import {useAuth} from "../../contexts/auth-context";
import {logRequestError} from "../../log";
import {ENDPOINTS} from "../../endpoints";
import {responseStatus} from "../../httpError";
import {ENTRY_ERROR_MESSAGES, entryError, type EntryError} from "./entryError";
import {sessionSchema} from "../../types/api";
import {parseResponse} from "../../contractFault";
import {clearMasterKey, enroll, unlock} from "../../masterKeySession";

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
    /* BEKÜLDÉS FOLYAMATBAN. Az E2EE miatt a beküldés már nem azonnali: a
       kulcs-származtatás (Argon2id) MÉRVE ~1,2 s, plusz a hálózat. E nélkül a gomb
       aktív maradna, és egy türelmetlen második kattintás MÁSODIK regisztrációt/
       feloldást indítana. A gombot a beküldés idejére letiltjuk (l. lentebb). */
    const [isSubmitting, setIsSubmitting] = useState(false);
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
    const url = isLogin ? ENDPOINTS.login : ENDPOINTS.signup;

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

    /* A KÉRÉS-HIBA KÖZÖS ZÁRÁSA. A döntés STÁTUSZKÓDON áll, nem a hibaüzenet szövegén:
       a szerver szerződése a kód (409 = névütközés), nem a mondat. A `responseStatus`
       VALÓDI alak-vizsgálatot végez (httpError.ts), nem `as`-szal. Hálózati hiba/időtúllépés
       → nincs `response`, tehát `undefined` státusz → `entryError` a „kérés" esetre. A
       beküldés-jelzőt itt oldjuk fel: a form marad, a gomb újra aktív. */
    const finishWithError = useCallback((requestError: unknown) => {
        logRequestError(requestError);
        setError(entryError(isLogin, responseStatus(requestError)));
        setIsSubmitting(false);
    }, [isLogin]);

    /* A SIKERES VÁLASZ FELDOLGOZÁSA. A séma mondja ki, MIT várunk: a törzs a munkamenet
       (a token HttpOnly sütiben megy). Nem navigálunk kézzel — a `login` átbillenti az
       isLoggedIn-t, a router a MEGNYITOTT címre renderel (a /login, /signup a belépett
       tábla „*" ágán a /to-dos-ra megy). A beküldés-jelzőt sikeren NEM oldjuk fel: az app
       átrenderel, az Entry lebomlik. */
    const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitting(true);

        if (isLogin) {
            handleAxios(url, {name: name, password: password}, (response) => {
                const newSession = parseResponse(sessionSchema, response.data, url);
                /* FELOLDÁS a beléptetés ELŐTT: a beírt jelszóból + a szerver adta
                   beiratkozásból kicsomagoljuk a mesterkulcsot (masterKeySession.unlock),
                   és csak utána léptetünk be — így a felület sosem villant „belépve, de
                   zárolt" állapotot. Beiratkozás nélküli (átmeneti, E2EE előtti) fióknál
                   nincs mit feloldani. */
                if (newSession.enrollment === undefined) return login(newSession);
                unlock(password, newSession.enrollment)
                    .then(() => login(newSession))
                    /* A szerver a jelszót MÁR elfogadta, tehát ide csak SÉRÜLT beiratkozás
                       juthat (rossz wrappedMk/só/paraméter), nem rossz jelszó. Nincs rá
                       külön felhasználói eset: kérés-hibaként jelezzük, a részlet a naplóba. */
                    .catch((unlockError: unknown) => {
                        logRequestError(unlockError);
                        setError(entryError(true, undefined));
                        setIsSubmitting(false);
                    });
            }, finishWithError);
            return;
        }

        /* REGISZTRÁCIÓ: a kliens ELŐBB legyártja a beiratkozást — friss mesterkulcs, a
           jelszóból származtatott kulccsal becsomagolva (masterKeySession.enroll). A
           mesterkulcs a memóriába kerül; a szerver csak a becsomagolt alakot kapja a többi
           mezővel. A `parallelism` stb. az enrollmenten belül van, ezért terjed szét a
           törzsbe. */
        enroll(password)
            .then((enrollment) => {
                handleAxios(url, {name: name, password: password, ...enrollment}, (response) => {
                    login(parseResponse(sessionSchema, response.data, url));
                }, (requestError) => {
                    /* A regisztráció elbukott: a memóriában maradt mesterkulcs ÁRVA —
                       eldobjuk, hogy egy újbóli próbálkozás friss kulcsot generáljon, ne
                       egy fél állapotút örökítsen tovább. */
                    clearMasterKey();
                    finishWithError(requestError);
                });
            })
            /* A kulcs-származtatás (Argon2) elhasalt — kérés-hibaként jelezzük. */
            .catch((cryptoError: unknown) => {
                logRequestError(cryptoError);
                setError(entryError(false, undefined));
                setIsSubmitting(false);
            });
    }, [isLogin, url, name, password, login, handleAxios, finishWithError]);

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
                {/* A jelszó-ürítés a linkről elmaradhat: a routes.tsx külön key-t
                    ad a két nézetnek, így a váltás új példányt hoz, üres mezőkkel. */}
                {/* A beküldés idejére (Argon2 + hálózat) is tiltjuk: enélkül egy második
                    kattintás MÁSODIK regisztrációt/feloldást indítana. */}
                <SubmitButtonGroup isDisabled={isDisabled || isSubmitting} isLogin={isLogin}/>
            </form>
        </div>
    );
}
