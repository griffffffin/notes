import {useCallback, useState, type ChangeEvent, type FormEvent, type MouseEventHandler} from "react";
import PasswordAndTooltip from "./Form/Input/Password/passwordAndTooltip";
import ErrorLabel from "./Form/errorLabel";
import SubmitButton from "../Button/submitButton";
import {useAuth} from "../../contexts/auth-context";
import {useTheme} from "../../contexts/theme-context";
import {unlock} from "../../masterKeySession";
import {logRequestError} from "../../log";
import type {Enrollment} from "../../types/api";

/* A ZÁROLT MUNKAMENET FELOLDÓ KÉPERNYŐJE — az E2EE elkerülhetetlen ára a jelenlegi
   modellben.

   MIÉRT LÉTEZIK EGYÁLTALÁN. A mesterkulcs (MK) kizárólag a lap memóriájában él
   (masterKeySession.ts), mert a szerver SOHA nem látja — ez maga az E2EE. Reload / új lap
   után tehát a munkamenet-süti szerint "belépve" vagyunk, de az MK eltűnt, és a tartalmat
   nincs mivel visszafejteni. A /me a beiratkozást (becsomagolt MK + só + KDF-paraméterek)
   visszaadja; ebből + a beírt jelszóból a kliens újraszámolja a KEK-et, kicsomagolja az
   MK-t, és memóriába teszi (unlock). A szerver ehhez sem kell — a jelszót itt sem látja.

   MIBEN MÁS, MINT AZ ENTRY BELÉPÉSE. A belépésnél a szerver ELŐBB hitelesíti a jelszót
   (szerveroldali hash), és csak utána oldunk fel; ide viszont a felhasználó a
   munkamenet-sütivel már "belépve" érkezik, a jelszót senki nem ellenőrizte — a feloldás
   maga a jelszó-próba. Ezért itt a rossz jelszó VALÓDI, felhasználó által javítható eset
   (az Entry belépő ágán az soha nem fordulhat elő).

   KIÚT: kijelentkezés. Aki nem tudja a jelszavát, ne ragadjon be a zárolt képernyőn — a
   logout a munkamenetet a szerveren is elvarrja (contexts/auth.tsx). */

/* Egyetlen felhasználói hibaüzenet. NEM az entryError.ts `credentials` szövege ("Hibás
   felhasználónév vagy jelszó."): ott a névfelderítés ellen mossuk össze a két esetet, itt
   viszont a nevet TUDJUK (a munkamenet a miénk), csak a jelszó lehet rossz — a helyesebb
   üzenet a szűkebb. */
const WRONG_PASSWORD_MESSAGE = "Hibás jelszó.";

type LockScreenProps = {
    /* A fiók beiratkozása a /me válaszából — a feloldáshoz kell (a becsomagolt MK + a KDF
       sója/paraméterei). A kapu (components/app.tsx) CSAK akkor rendereli ezt a képernyőt,
       ha VAN beiratkozás ÉS nincs feloldott MK, ezért itt sosem `undefined`. */
    enrollment: Enrollment;
};

export default function LockScreen({enrollment}: LockScreenProps) {
    const [password, setPassword] = useState("");
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    /* A típus a boolean-nél magától is jó, de a hiba KIMONDVA olvashatóbb: a mező azt
       jelzi, hogy a legutóbbi feloldás rossz jelszóval bukott. */
    const [hasWrongPassword, setHasWrongPassword] = useState(false);
    /* BEKÜLDÉS FOLYAMATBAN. A feloldás nem azonnali: az Argon2id KDF MÉRVE ~1,2 s. A
       gombokat erre az időre letiltjuk — enélkül egy türelmetlen második kattintás MÁSODIK,
       fölösleges kulcs-származtatást indítana (ugyanaz az ok, mint az Entry-nél). */
    const [isSubmitting, setIsSubmitting] = useState(false);
    const {logout} = useAuth();
    const {color, isChecked} = useTheme();

    const handlePasswordChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        // A hibafelirat az első leütésre eltűnik: aki javítani kezd, ne a régi hibát nézze.
        setHasWrongPassword(false);
        setPassword(event.target.value);
    }, []);

    const toggleVisibility: MouseEventHandler<HTMLButtonElement> =
        useCallback(() => setIsPasswordVisible((visible) => !visible), []);

    const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitting(true);
        /* A beírt jelszó + a fiók beiratkozása → mesterkulcs a memóriába (unlock). SIKERKOR
           a masterKeySession értesíti a felíratkozókat (useSyncExternalStore), a kapu
           (app.tsx) átvált a Routes-ra, és ez a komponens lebomlik — ezért a sikerágon NEM
           oldjuk fel a beküldés-jelzőt (nincs már mit).

           HIBAKOR itt szinte mindig ROSSZ JELSZÓ van (l. a fejléc-komment). A GCM-címke
           nem-egyezését a jelszón kívül csak a beiratkozás sérülése okozhatná, azt viszont
           kliens-oldalról nem lehet megkülönböztetni (épp ez az AEAD lényege) — a domináns,
           javítható esetet mondjuk ki, a részlet a naplóba (csak dev, l. logRequestError). */
        unlock(password, enrollment)
            .catch((error: unknown) => {
                logRequestError(error);
                setHasWrongPassword(true);
                setIsSubmitting(false);
            });
    }, [password, enrollment]);

    return (
        <div className="container-fluid d-flex justify-content-center align-items-center mt-4 pt-2 px-0">
            <form className="col-10 col-sm-6 col-md-5 col-xl-3 text-theme-text" onSubmit={handleSubmit}>
                <div className="mb-4 text-center">
                    <h1><strong>Zárolt munkamenet</strong></h1>
                    <p className="mb-0">Add meg a jelszavad a tartalom feloldásához.</p>
                </div>

                <div className={isChecked ? "mb-4 text-black-50" : "mb-4"}>
                    {/* isLogin=true: nincs jelszó-szabály-súgó és nincs megerősítő mező — a
                        meglévő jelszót gépeljük be, nem újat választunk. A szem-ikon marad. */}
                    <PasswordAndTooltip isLogin={true} isVisible={isPasswordVisible}
                                        value={password} handleChange={handlePasswordChange}
                                        handleClick={toggleVisibility}/>
                    <ErrorLabel message={hasWrongPassword ? WRONG_PASSWORD_MESSAGE : null}/>
                </div>

                <div className="d-grid gap-2">
                    {/* Üres mezőn és a feloldás alatt tiltva; a type alapból "submit". */}
                    <SubmitButton isDisabled={password.length === 0 || isSubmitting}
                                  isOutline={false} color={color} text="Feloldás"/>
                    <hr className="w-90 mx-auto"/>
                    {/* type="button": a kijelentkezés NEM sütheti el a feloldó űrlapot
                        (nested-submit csapda). A logout a munkamenetet a szerveren is
                        elvarrja (contexts/auth.tsx); a feloldás alatt tiltva, hogy ne
                        versenyezzen egy épp futó kulcs-származtatással. */}
                    <SubmitButton isDisabled={isSubmitting} isOutline={true} color={color}
                                  type="button" onClick={logout} text="Kijelentkezés"/>
                </div>
            </form>
        </div>
    );
}
